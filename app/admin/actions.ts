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

        // 🌟 請將這裡替換成您剛剛在後台複製的 R2 公開網址
        const R2_PUBLIC_URL = "pub-f5a70c4f84d841ada9cbda4eafbb30ee.r2.dev"; 

        // 1. 抓取外部圖片
        const response = await fetch(externalUrl);
        if (!response.ok) return externalUrl; // 如果抓不到，就退回使用原網址

        // 2. 轉換為 ArrayBuffer 以便上傳
        const arrayBuffer = await response.arrayBuffer();
        const contentType = response.headers.get('content-type') || 'image/jpeg';

        // 3. 寫入 R2
        await env.BUCKET.put(fileName, arrayBuffer, {
            httpMetadata: { contentType }
        });

        // 4. 回傳您專屬的 R2 圖片網址
        return `${R2_PUBLIC_URL}/${fileName}`;

    } catch (error) {
        console.error("R2 上傳失敗:", error);
        return externalUrl; // 發生任何錯誤時，安全退回使用原本的外部網址
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

    const processedCards = await Promise.all(cards.map(async (card) => {
        if (card.image && !card.image.includes('r2.dev')) {
            const fileName = `cards/${card.series_id}/${card.id}.jpg`;
            card.image = await uploadImageToR2(card.image, fileName);
        }
        return card;
    }));

    const db = getDb();
    await db.insert(schema.uiCards).values(processedCards).onConflictDoUpdate({
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
    return cards.length;
}

export async function upsertBatches(batches: any[]) {
    if (!batches || batches.length === 0) return 0;

    const processedBatches = await Promise.all(batches.map(async (batch) => {
        if (batch.image && !batch.image.includes('r2.dev')) {
            const fileName = `batches/${batch.id}.jpg`;
            batch.image = await uploadImageToR2(batch.image, fileName);
        }
        return batch;
    }));

    const db = getDb();
    await db.insert(schema.batches).values(processedBatches).onConflictDoUpdate({
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
    return batches.length;
}
