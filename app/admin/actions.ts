'use server';
import { revalidatePath } from 'next/cache';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
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
    if (!cards || cards.length === 0) return 0;
    try {
        // 🌟 改為呼叫 API route，避免 Server Action 在 Cloudflare Pages 上偶發 405 / 靜默失敗
        // （畫面顯示同步完成，但實際沒有寫入資料庫），做法與 upsertPocaCards 一致。
        const res = await fetch('/api/crawler/upsert-cards', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cards })
        });
        if (!res.ok) {
            const errorText = await res.text();
            throw new Error(`API Error: ${res.status} ${errorText}`);
        }
        const data: any = await res.json();
        if (!data.success) throw new Error(data.error || '寫入失敗');
        return data.count as number;
    } catch (error: any) {
        console.error("🔥 upsertCards 嚴重錯誤:", error);
        throw error;
    }
}

export async function upsertBatches(batches: any[]) {
    if (!batches || batches.length === 0) return 0;
    try {
        // 🌟 改為呼叫 API route，避免 Server Action 在 Cloudflare Pages 上偶發 405 / 靜默失敗
        // （畫面顯示同步完成，但實際沒有寫入資料庫），做法與 upsertPocaCards 一致。
        const res = await fetch('/api/crawler/upsert-batches', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ batches })
        });
        if (!res.ok) {
            const errorText = await res.text();
            throw new Error(`API Error: ${res.status} ${errorText}`);
        }
        const data: any = await res.json();
        if (!data.success) throw new Error(data.error || '寫入失敗');
        return data.count as number;
    } catch (error: any) {
        console.error("🔥 upsertBatches 嚴重錯誤:", error);
        throw error;
    }
}

export async function upsertPocaCards(pocaCards: any[]) {
    if (!pocaCards || pocaCards.length === 0) return { success: true, count: 0 };

    try {
        // 🌟 改為呼叫 API route，避免 Server Action 在 Cloudflare Pages 上的 405 錯誤
        const res = await fetch('/api/poca/upsert', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: pocaCards })
        });
        if (!res.ok) {
            const errorText = await res.text();
            return { success: false, error: `API Error: ${res.status} ${errorText}` };
        }
        return await res.json();
    } catch (error: any) {
        console.error("🔥 upsertPocaCards 嚴重錯誤:", error);
        return { success: false, error: error.message };
    }
}
