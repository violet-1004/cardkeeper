'use server';

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
    await db.insert(schema.series).values(newSeries);
}

export async function fetchChannels() {
    const db = getDb();
    return await db.select().from(schema.channels);
}

export async function upsertCards(cards: any[]) {
    if (!cards || cards.length === 0) return 0;

    const db = getDb();
    const CHUNK_SIZE = 25; // 限制單次資料庫寫入與併發請求數

    for (let i = 0; i < cards.length; i += CHUNK_SIZE) {
        const chunk = cards.slice(i, i + CHUNK_SIZE);
        
        const processedChunk = await Promise.all(chunk.map(async (card) => {
            if (card.image && !card.image.includes('r2.dev')) {
                const fileName = `cards/${card.seriesId}/${card.id}.jpg`;
                card.image = await uploadImageToR2(card.image, fileName);
            }
            return card;
        }));

        await db.insert(schema.uiCards).values(processedChunk).onConflictDoUpdate({
            target: schema.uiCards.id,
            set: {
                name: sql`excluded.name`,
                memberId: sql`excluded.member_id`,
                image: sql`excluded.image`,
                type: sql`excluded.type`,
                seriesId: sql`excluded.series_id`,
                groupId: sql`excluded.group_id`,
            }
        });
    }
    return cards.length;
}

export async function upsertBatches(batches: any[]) {
    if (!batches || batches.length === 0) return 0;

    const db = getDb();
    const CHUNK_SIZE = 25;

    for (let i = 0; i < batches.length; i += CHUNK_SIZE) {
        const chunk = batches.slice(i, i + CHUNK_SIZE);
        
        const processedChunk = await Promise.all(chunk.map(async (batch) => {
            if (batch.image && !batch.image.includes('r2.dev')) {
                const fileName = `batches/${batch.id}.jpg`;
                batch.image = await uploadImageToR2(batch.image, fileName);
            }
            return batch;
        }));

        await db.insert(schema.batches).values(processedChunk).onConflictDoUpdate({
            target: schema.batches.id,
            set: {
                name: sql`excluded.name`,
                type: sql`excluded.type`,
                channel: sql`excluded.channel`,
                batchNumber: sql`excluded.batch_number`,
                date: sql`excluded.date`,
                groupId: sql`excluded.group_id`,
                seriesId: sql`excluded.series_id`,
                image: sql`excluded.image`,
            }
        });
    }
    return batches.length;
}
