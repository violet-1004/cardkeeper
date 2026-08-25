import { getRequestContext } from '@cloudflare/next-on-pages';
import { drizzle } from 'drizzle-orm/d1';
import { sql } from 'drizzle-orm';
import * as schema from '@/schema';
import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { uploadImageToR2 } from '@/lib/r2Upload';

// 🌟 改為獨立 API Route（而非 Server Action），避免 Server Action 在 Cloudflare Pages
// 上偶發被攔截導致 405 / 靜默失敗（前端顯示「同步完成」但資料庫實際沒有寫入）的問題。
// 做法與 /api/poca/upsert 一致。
export const runtime = 'edge';

function getDb() {
    const env = getRequestContext().env as any;
    if (!env.DB) throw new Error("Database binding 'DB' not found.");
    return drizzle(env.DB, { schema });
}

export async function POST(req: Request) {
    try {
        const { batches }: { batches: any[] } = await req.json();
        if (!batches || !Array.isArray(batches) || batches.length === 0) {
            return NextResponse.json({ success: true, count: 0 });
        }

        const env = getRequestContext().env as any;
        const CHUNK_SIZE = 5; // 🌟 防堵 Cloudflare 50 個子請求限制
        const skipR2Upload = batches.length > 20;

        const allProcessedBatches: any[] = [];
        for (const batch of batches) {
            let image = batch.image;
            if (!skipR2Upload && image && !image.includes('r2.dev')) {
                const fileName = `batches/${batch.id}.jpg`;
                image = await uploadImageToR2(env, image, fileName);
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

        const db = getDb();
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

        revalidatePath('/', 'layout');
        return NextResponse.json({ success: true, count: allProcessedBatches.length });
    } catch (error: any) {
        console.error("🔥 /api/crawler/upsert-batches Error:", error);
        return NextResponse.json({ success: false, error: error.message, cause: error.cause }, { status: 500 });
    }
}
