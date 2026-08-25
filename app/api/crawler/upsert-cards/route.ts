import { getRequestContext } from '@cloudflare/next-on-pages';
import { drizzle } from 'drizzle-orm/d1';
import { inArray } from 'drizzle-orm';
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
        const { cards }: { cards: any[] } = await req.json();
        if (!cards || !Array.isArray(cards) || cards.length === 0) {
            return NextResponse.json({ success: true, count: 0 });
        }

        const env = getRequestContext().env as any;
        const skipR2Upload = cards.length > 20; // 🌟 核心防爆：大量同步時跳過 R2 上傳

        const allProcessedCards: any[] = [];
        for (const card of cards) {
            let image = card.image;
            const seriesId = card.seriesId || card.series_id;
            if (!skipR2Upload && image && !image.includes('r2.dev')) {
                const fileName = `cards/${seriesId}/${card.id}.jpg`;
                image = await uploadImageToR2(env, image, fileName);
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

        const db = getDb();

        // 🌟 用 drizzle 的 inArray() 取代 sql`id IN ${array}` 原始拼接寫法：
        // 後者在 D1 上不會正確展開陣列參數，導致「已存在 ID」永遠查不到，
        // 進而讓後續插入行為不穩定。
        const incomingCardIds = allProcessedCards.map(c => c.id);
        const existingCards = await db.select({ id: schema.uiCards.id }).from(schema.uiCards).where(inArray(schema.uiCards.id, incomingCardIds));
        const existingCardIds = new Set(existingCards.map(c => c.id));

        const cardsToInsert = allProcessedCards.filter(c => !existingCardIds.has(c.id));

        if (cardsToInsert.length > 0) {
            await db.insert(schema.uiCards).values(cardsToInsert);
        }

        revalidatePath('/', 'layout');
        return NextResponse.json({ success: true, count: cardsToInsert.length });
    } catch (error: any) {
        console.error("🔥 /api/crawler/upsert-cards Error:", error);
        return NextResponse.json({ success: false, error: error.message, cause: error.cause }, { status: 500 });
    }
}
