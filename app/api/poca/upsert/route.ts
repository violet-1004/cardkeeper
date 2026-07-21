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

        // 🌟 防呆：強制補齊必填欄位，避免任何一筆缺值導致整批 500
        const safeItems = items.map((item) => ({
            ...item,
            id: item.id, // 確保 id 存在
            image: item.image || '', // 防呆：避免 image 為 null
            stocked_count: item.stocked_count || 0, // 防呆：避免 stocked_count 為 null
            price: item.price || 0, // 防呆：避免 price 為 null
            group_name_en: item.group_name_en || 'cravity',
        }));

        const db = getDb();

        // Drizzle ORM's onConflictDoUpdate is compatible with D1
        await db.insert(schema.poca).values(safeItems).onConflictDoUpdate({
            target: schema.poca.id,
            set: {
                image: sql`excluded.image`,
                stocked_count: sql`excluded.stocked_count`,
                price: sql`excluded.price`,
                group_name_en: sql`excluded.group_name_en`
            }
        });

        return NextResponse.json({ success: true, count: safeItems.length });
    } catch (error: any) {
        console.error("🔥 /api/poca/upsert Error:", error);
        if (error.cause) {
            console.error("🔥 /api/poca/upsert Error Cause:", error.cause);
        }
        return NextResponse.json({ success: false, error: error.message, cause: error.cause }, { status: 500 });
    }
}
