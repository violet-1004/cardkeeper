import { getRequestContext } from '@cloudflare/next-on-pages';
import { drizzle } from 'drizzle-orm/d1';
import { sql } from 'drizzle-orm';
import * as schema from '@/schema';
import { NextResponse } from 'next/server';

// Required for Cloudflare Pages
export const runtime = 'edge';

function getDb() {
    const env = getRequestContext().env as any;
    if (!env.DB) {
        throw new Error("Database binding 'DB' not found.");
    }
    return drizzle(env.DB, { schema });
}

export async function POST(req: Request) {
    try {
        // 🌟 修正：為 items 加上 Drizzle 的推斷類型，解決 TypeScript 報錯
        type NewPoca = typeof schema.poca.$inferInsert;
        const { items }: { items: NewPoca[] } = await req.json();

        if (!items || !Array.isArray(items) || items.length === 0) {
            return NextResponse.json({ success: true, count: 0 });
        }

        const db = getDb();

        // Drizzle ORM's onConflictDoUpdate is compatible with D1
        await db.insert(schema.poca).values(items).onConflictDoUpdate({
            target: schema.poca.id,
            set: {
                image: sql`excluded.image`,
                stocked_count: sql`excluded.stocked_count`,
                price: sql`excluded.price`,
                group_name_en: sql`excluded.group_name_en` // 🌟 修正：在更新時也一併更新 group_name_en，避免 NOT NULL 約束失敗
            }
        });

        return NextResponse.json({ success: true, count: items.length });
    } catch (error: any) {
        console.error("🔥 /api/poca/upsert Error:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
