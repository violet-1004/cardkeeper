import { getRequestContext } from '@cloudflare/next-on-pages';
import { drizzle } from 'drizzle-orm/d1';
import { sql } from 'drizzle-orm';
import * as schema from '@/schema';

export const runtime = 'edge';

export async function POST(request: Request) {
    try {
        const pocaCards = await request.json();
        if (!Array.isArray(pocaCards) || pocaCards.length === 0) {
            return Response.json({ success: true, count: 0 });
        }

        const env = getRequestContext().env as any;
        const db = drizzle(env.DB);
        const CHUNK_SIZE = 20;

        for (let i = 0; i < pocaCards.length; i += CHUNK_SIZE) {
            const chunk = pocaCards.slice(i, i + CHUNK_SIZE);
            await db.insert(schema.poca).values(chunk).onConflictDoUpdate({
                target: schema.poca.id,
                set: {
                    image: sql`excluded.image`,
                    stocked_count: sql`excluded.stocked_count`,
                    price: sql`excluded.price`
                }
            });
        }

        return Response.json({ success: true, count: pocaCards.length });
    } catch (error: any) {
        console.error("🔥 upsertPocaCards 嚴重錯誤:", error);
        return Response.json({ success: false, error: error.message }, { status: 500 });
    }
}