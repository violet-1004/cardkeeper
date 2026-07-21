'use server';
import { revalidatePath } from 'next/cache';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { drizzle } from 'drizzle-orm/d1';
import { eq, sql } from 'drizzle-orm';
import * as schema from '@/schema';

// 負責將外部圖片下載並轉存至您的 R2
export async function uploadImageToR2(externalUrl: string, fileName: string) {
    try {
        // 取得 R2 綁定與設定您的公開網址
        const env = getRequestContext().env as any;
        if (!env.BUCKET) throw new Error("R2 尚未綁定");

        // 🌟 優先讀取環境變數中的 R2 公開網址，若無則使用預設值
        const R2_PUBLIC_URL = env.R2_PUBLIC_URL || "https://pub-f5a70c4f84d841ada9cbda4eafbb30ee.r2.dev"; 

        let arrayBuffer: ArrayBuffer;
        let contentType: string;

        // 1. 判斷圖片網址格式
        if (externalUrl.startsWith('http')) {
            // 抓取外部 HTTP/HTTPS 圖片
            const response = await fetch(externalUrl);
            // 🌟 修正：如果圖片抓取失敗 (例如 404)，直接回傳 null，避免將無效網址存入資料庫
            if (!response.ok) {
                console.warn(`圖片抓取失敗 (狀態: ${response.status}): ${externalUrl}`);
                return null;
            }
            arrayBuffer = await response.arrayBuffer();
            contentType = response.headers.get('content-type') || 'image/jpeg';
        } else {
            // 若是不支援的格式 (例如相對路徑)，則直接退回
            return externalUrl;
        }

        // 3. 寫入 R2
        await env.BUCKET.put(fileName, arrayBuffer, {
            httpMetadata: { contentType }
        });

        // 4. 回傳您專屬的 R2 圖片網址
        return `${R2_PUBLIC_URL}/${fileName}`;

    } catch (error) {
        console.error("R2 上傳失敗:", error);
        // 🌟 修正：發生任何其他錯誤時，也回傳 null
        return null;
    }
}

function getDb() {
    const env = getRequestContext().env as any;
    return drizzle(env.DB);
}

export async function fetchSeriesAndGroups() {
    const db = getDb();
    const seriesData = await db.select().from(schema.series);
    const groupsData = await db.select().from(schema.groups);
    return { seriesData, groupsData };
}

export async function updateSeriesApi(id: number, api: string) {
    const db = getDb();
    await db.update(schema.series).set({ api }).where(eq(schema.series.id, id));
}

export async function insertSeries(newSeries: any) {
    const db = getDb();
    await db.insert(schema.series).values({
        id: newSeries.id ? String(newSeries.id) as any : Date.now().toString() as any,
        name: newSeries.name,
        group_id: (newSeries.groupId || newSeries.group_id) ? String(newSeries.groupId || newSeries.group_id) as any : null,
        short_name: newSeries.shortName || newSeries.short_name || null,
        subunit: newSeries.subunit || null,
        type: newSeries.type || null,
        date: newSeries.date || null,
        api: newSeries.api || null
    });
}

export async function fetchChannels() {
    const db = getDb();
    return await db.select().from(schema.channels);
}

export async function upsertCards(cards: any[]) {
    try {
    if (!cards || cards.length === 0) return 0;

    const db = getDb();
    const CHUNK_SIZE = 5; // 🌟 限制單次資料庫寫入與併發請求數 (防堵 Cloudflare 50 個子請求限制)，降低併發以提高穩定性
    const skipR2Upload = cards.length > 20; // 🌟 核心防爆：大量同步時跳過 R2 上傳

    // 🌟 重構：將 Promise.all 的併發處理，改為循序處理，避免 Edge Function 超時
    const allProcessedCards = [];
    for (const card of cards) {
        let image = card.image;
        const seriesId = card.seriesId || card.series_id;
        if (!skipR2Upload && image && !image.includes('r2.dev')) {
            const fileName = `cards/${seriesId}/${card.id}.jpg`;
            image = await uploadImageToR2(image, fileName);
        }
        allProcessedCards.push({
            id: String(card.id) as any,
            name: card.name,
            member_id: (card.memberId || card.member_id) ? String(card.memberId || card.member_id) as any : null,
            image: image || null,
            type: card.type || null,
            series_id: seriesId ? String(seriesId) as any : null,
            group_id: (card.groupId || card.group_id) ? String(card.groupId || card.group_id) as any : null,
        });
    }

    // 🌟 終極修正：在伺服器端進行精準比對，徹底解決重複寫入問題
    // 1. 從本次要處理的卡片中，取出所有 ID
    const incomingCardIds = allProcessedCards.map(c => c.id);
    if (incomingCardIds.length === 0) {
        return 0;
    }

    // 2. 到資料庫查詢這些 ID 中，哪些是已經存在的
    const existingCards = await db.select({ id: schema.uiCards.id }).from(schema.uiCards).where(sql`id IN ${incomingCardIds}`);
    const existingCardIds = new Set(existingCards.map(c => c.id));

    // 3. 過濾出真正需要新增的卡片
    const cardsToInsert = allProcessedCards.filter(c => !existingCardIds.has(c.id));

    // 4. 只對新卡片執行插入操作
    if (cardsToInsert.length > 0) {
        await db.insert(schema.uiCards).values(cardsToInsert);
    }

    // 🌟 寫入完畢後，強制清除 Next.js 伺服器端對於首頁的快取
    revalidatePath('/', 'layout');
    return cardsToInsert.length; // 回傳實際寫入的筆數
    } catch (error: any) {
        console.error("🔥 upsertCards 嚴重錯誤:", error);
        throw error;
    }
}

export async function upsertBatches(batches: any[]) {
    try {
    if (!batches || batches.length === 0) return 0;

    const db = getDb();
    const CHUNK_SIZE = 5; // 🌟 防堵 Cloudflare 50 個子請求限制，降低併發以提高穩定性
    const skipR2Upload = batches.length > 20;

    // 🌟 重構：將 Promise.all 的併發處理，改為循序處理，避免 Edge Function 超時
    const allProcessedBatches = [];
    for (const batch of batches) {
        let image = batch.image;
        if (!skipR2Upload && image && !image.includes('r2.dev')) {
            const fileName = `batches/${batch.id}.jpg`;
            image = await uploadImageToR2(image, fileName);
        }
        allProcessedBatches.push({
            id: String(batch.id) as any,
            name: batch.name,
            type: batch.type || null,
            channel: batch.channel || null,
            batch_number: batch.batchNumber || batch.batch_number || null,
            date: batch.date || null,
            group_id: (batch.groupId || batch.group_id) ? String(batch.groupId || batch.group_id) as any : null,
            series_id: (batch.seriesId || batch.series_id) ? String(batch.seriesId || batch.series_id) as any : null,
            image: image || null,
        });
    }

    // 🌟 循序處理完圖片後，再分批寫入資料庫
    for (let i = 0; i < allProcessedBatches.length; i += CHUNK_SIZE) {
        const chunk = allProcessedBatches.slice(i, i + CHUNK_SIZE);
        await db.insert(schema.batches).values(chunk).onConflictDoUpdate({
            target: schema.batches.id,
            set: {
                name: sql`excluded.name`,
                type: sql`excluded.type`,
                channel: sql`excluded.channel`,
                batch_number: sql`excluded.batch_number`,
                date: sql`excluded.date`,
                group_id: sql`excluded.group_id`,
                series_id: sql`excluded.series_id`,
                image: sql`excluded.image`,
            }
        });
    }

    // 🌟 寫入完畢後，強制清除 Next.js 伺服器端對於首頁的快取
    revalidatePath('/', 'layout');
    return batches.length;
    } catch (error: any) {
        console.error("🔥 upsertBatches 嚴重錯誤:", error);
        throw error;
    }
}

export async function upsertPocaCards(pocaCards: any[]) {
    if (!pocaCards || pocaCards.length === 0) return { success: true, count: 0 };

    const db = getDb(); // D1 a single statement can have up to 100 placeholders. Poca table has 4 columns. 100/4 = 25. Let's use 20 to be safe.
    const CHUNK_SIZE = 20;

    try {
        for (let i = 0; i < pocaCards.length; i += CHUNK_SIZE) {
            const chunk = pocaCards.slice(i, i + CHUNK_SIZE);
            await db.insert(schema.poca).values(chunk).onConflictDoUpdate({
                target: schema.poca.id,
                // 🌟 核心修正：無論如何都更新所有欄位，避免 Drizzle 產生空的 SET 子句導致 D1 報錯
                set: {
                    image: sql`excluded.image`,
                    stocked_count: sql`excluded.stocked_count`,
                    price: sql`excluded.price`
                }
            });
        }
        return { success: true, count: pocaCards.length };
    } catch (error: any) {
        console.error("🔥 upsertPocaCards 嚴重錯誤:", error);
        return { success: false, error: error.message };
    }
}
