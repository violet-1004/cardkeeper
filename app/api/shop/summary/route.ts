import { getDb, ensureShopSchema, json, fail, resolveGroupId, cachedJson, finalizeRoundIfClosed, fetchRoundItems } from '@/lib/shopServer';
import { allocate, cutoffMs, isRoundClosed, openRoundDate, previousRoundDate, ROUND_RE, type OrderItem } from '@/lib/shop';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    return cachedJson(req, 8, async () => {
        try {
            const db = getDb();
            await ensureShopSchema(db);
            const now = Date.now();
            const open = openRoundDate(now);
            const prev = previousRoundDate(open);
            const url = new URL(req.url);
            const wanted = url.searchParams.get('round');
            const round = wanted && ROUND_RE.test(wanted) && (wanted === open || wanted === prev) ? wanted : open;
            const closed = isRoundClosed(round, now);
            if (closed) await finalizeRoundIfClosed(db, round);

            const groupName = url.searchParams.get('group');
            const groupId = groupName ? await resolveGroupId(db, groupName) : null;
            if (groupName && groupId === null) {
                return json({ round, closed, cutoffAt: cutoffMs(round), openRound: open, previousRound: prev, now, participants: [], groupNotFound: true });
            }

            const rows = await fetchRoundItems(db, round, groupId);
            const items: OrderItem[] = rows.map((r) => ({
                userKey: r.userKey, cardId: r.cardId, qty: r.qty, price: r.price, isBlack: r.isBlack, submittedAt: r.submittedAt,
            }));
            const { ranking } = allocate(items, new Map()); // 只取排序；結單後的中籤狀態以資料庫為準

            const participants = ranking.map((u, i) => ({
                rank: i + 1,
                name: rows.find((r) => r.userKey === u.userKey)?.name || u.userKey,
                total: u.total,
                black: u.black,
                items: rows
                    .filter((r) => r.userKey === u.userKey)
                    .sort((a, b) => b.price - a.price)
                    .map((r) => ({
                        cardId: r.cardId, qty: r.qty, title: r.title, memberName: r.memberName,
                        image: r.image, price: r.price, isBlack: r.isBlack,
                        color: r.color, status: closed ? r.status : 'pending',
                    })),
            }));

            return json({ round, closed, cutoffAt: cutoffMs(round), openRound: open, previousRound: prev, now, participants });
        } catch (e) {
            console.error('shop summary error', e);
            return fail('載入失敗，請稍後再試', 500);
        }
    });
}
