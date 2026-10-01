import { getDb, ensureShopSchema, json, fail, finalizeRoundIfClosed, fetchRoundItems } from '@/lib/shopServer';
import { allocate, cutoffMs, isRoundClosed, openRoundDate, ROUND_RE, type OrderItem } from '@/lib/shop';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// 後台專用：任何一天的 mycardshop 訂單總覽（不限今天/昨天），含買家 userKey 供刪除/出貨操作用。
export async function GET(req: Request) {
    try {
        const db = getDb();
        await ensureShopSchema(db);
        const now = Date.now();
        const url = new URL(req.url);
        const wanted = url.searchParams.get('round');
        const round = wanted && ROUND_RE.test(wanted) ? wanted : openRoundDate(now);
        const closed = isRoundClosed(round, now);
        if (closed) await finalizeRoundIfClosed(db, round);

        const rows = await fetchRoundItems(db, round);
        const items: OrderItem[] = rows.map((r) => ({
            userKey: r.userKey, cardId: r.cardId, qty: r.qty, price: r.price, isBlack: r.isBlack, submittedAt: r.submittedAt,
        }));
        const { ranking } = allocate(items, new Map());

        const participants = ranking.map((u, i) => ({
            rank: i + 1,
            userKey: u.userKey,
            name: rows.find((r) => r.userKey === u.userKey)?.name || u.userKey,
            total: u.total,
            black: u.black,
            items: rows
                .filter((r) => r.userKey === u.userKey)
                .sort((a, b) => b.price - a.price)
                .map((r) => ({
                    cardId: r.cardId, qty: r.qty, title: r.title, memberName: r.memberName, image: r.image,
                    price: r.price, isBlack: r.isBlack, color: r.color, groupId: r.groupId,
                    status: closed ? r.status : 'pending',
                })),
        }));

        return json({ round, closed, cutoffAt: cutoffMs(round), participants });
    } catch (e) {
        console.error('shop-admin summary error', e);
        return fail('載入失敗', 500);
    }
}
