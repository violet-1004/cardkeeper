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

        // 🌟 補上 https:// 確保回傳正確的絕對網址
        const R2_PUBLIC_URL = "https://pub-f5a70c4f84d841ada9cbda4eafbb30ee.r2.dev"; 

        let arrayBuffer: ArrayBuffer;
        let contentType: string;

        // 1. 判斷圖片網址格式
        if (externalUrl.startsWith('http')) {
            // 抓取外部 HTTP/HTTPS 圖片
            const response = await fetch(externalUrl);
            if (!response.ok) return externalUrl;
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
        return externalUrl;
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
        id: newSeries.id ? Number(newSeries.id) : Date.now(),
        name: newSeries.name,
        group_id: (newSeries.groupId || newSeries.group_id) ? Number(newSeries.groupId || newSeries.group_id) : null,
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
    if (!cards || cards.length === 0) return 0;

    const db = getDb();
    const CHUNK_SIZE = 10; // 🌟 限制單次資料庫寫入與併發請求數 (防堵 Cloudflare 50 個子請求限制)

    for (let i = 0; i < cards.length; i += CHUNK_SIZE) {
        const chunk = cards.slice(i, i + CHUNK_SIZE);
        
        const processedChunk = await Promise.all(chunk.map(async (card) => {
            let image = card.image;
            const seriesId = card.seriesId || card.series_id;
            if (image && !image.includes('r2.dev')) {
                const fileName = `cards/${seriesId}/${card.id}.jpg`;
                image = await uploadImageToR2(image, fileName);
            }
            return {
                id: Number(card.id),
                name: card.name,
                member_id: (card.memberId || card.member_id) ? Number(card.memberId || card.member_id) : null,
                image: image || null,
                type: card.type || null,
                series_id: seriesId ? Number(seriesId) : null,
                group_id: (card.groupId || card.group_id) ? Number(card.groupId || card.group_id) : null,
            };
        }));

        await db.insert(schema.uiCards).values(processedChunk).onConflictDoUpdate({
            target: schema.uiCards.id,
            set: {
                name: sql`excluded.name`,
                member_id: sql`excluded.member_id`,
                image: sql`excluded.image`,
                type: sql`excluded.type`,
                series_id: sql`excluded.series_id`,
                group_id: sql`excluded.group_id`,
            }
        });
    }

    // 🌟 寫入完畢後，強制清除 Next.js 伺服器端對於首頁的快取
    revalidatePath('/', 'layout');
    return cards.length;
}

export async function upsertBatches(batches: any[]) {
    if (!batches || batches.length === 0) return 0;

    const db = getDb();
    const CHUNK_SIZE = 10; // 🌟 防堵 Cloudflare 50 個子請求限制

    for (let i = 0; i < batches.length; i += CHUNK_SIZE) {
        const chunk = batches.slice(i, i + CHUNK_SIZE);
        
        const processedChunk = await Promise.all(chunk.map(async (batch) => {
            let image = batch.image;
            if (image && !image.includes('r2.dev')) {
                const fileName = `batches/${batch.id}.jpg`;
                image = await uploadImageToR2(image, fileName);
            }
            return {
                id: Number(batch.id),
                name: batch.name,
                type: batch.type || null,
                channel: batch.channel || null,
                batch_number: batch.batchNumber || batch.batch_number || null,
                date: batch.date || null,
                group_id: (batch.groupId || batch.group_id) ? Number(batch.groupId || batch.group_id) : null,
                series_id: (batch.seriesId || batch.series_id) ? Number(batch.seriesId || batch.series_id) : null,
                image: image || null,
            };
        }));

        await db.insert(schema.batches).values(processedChunk).onConflictDoUpdate({
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
}
