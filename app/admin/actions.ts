'use server';

import { getRequestContext } from '@cloudflare/next-on-pages';
import { drizzle } from 'drizzle-orm/d1';
import { eq, sql } from 'drizzle-orm';
import * as schema from '@/schema';

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
    await db.insert(schema.uiCards).values(cards).onConflictDoUpdate({
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
    const db = getDb();
    await db.insert(schema.batches).values(batches).onConflictDoUpdate({
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