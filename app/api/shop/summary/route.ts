import { getDb, ensureShopSchema, json, fail } from '@/lib/shopServer';
import { allocate, cutoffMs, isRoundClosed, openRoundDate, previousRoundDate, ROUND_RE, type OrderItem } from '@/lib/shop';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// 結單後第一次有人查看時，依順位把庫存分給順位前面的人，並把結果寫進 shop_order_items.status。
// 整個過程只讀取販售資料的 quantity，只寫入 shop_ 資料表；結果決定性相同，重複執行也安全。
async function finalizeRound(db: any, round: string) {
    const done = await db.prepare(`SELECT 1 AS ok FROM shop_rounds WHERE round_date = ?`).bind(round).first();
    if (done) return;

    const { results: rows } = await db
        .prepare(`SELECT user_key, card_id, price, is_black, submitted_at FROM shop_order_items WHERE round_date = ?`)
        .bind(round)
        .all();
    const items: OrderItem[] = (rows || []).map((r: any) => ({
        userKey: String(r.user_key),
        cardId: Number(r.card_id),
        price: Number(r.price),
        isBlack: Number(r.is_black) === 1,
        submittedAt: String(r.submitted_at),
    }));

    // 結單當下的庫存 = 販售資料裡該卡最後一筆 quantity；已下架的卡視為 0（一律打叉）
    const stock = new Map<number, number>();
    const cardIds = [...new Set(items.map((i) => i.cardId))];
    for (let i = 0; i < cardIds.length; i += 50) {
        const chunk = cardIds.slice(i, i + 50);
        const marks = chunk.map(() => '?').join(',');
        const { results } = await db
            .prepare(
                `SELECT s.card_id, s.quantity FROM ui_sales s
                 WHERE s.card_id IN (${marks}) AND s.quantity > 0
                   AND s.rowid = (SELECT MAX(rowid) FROM ui_sales WHERE card_id = s.card_id AND quantity > 0)`
            )
            .bind(...chunk)
            .all();
        for (const r of results || []) stock.set(Number(r.card_id), Number(r.quantity));
    }

    const { status } = allocate(items, stock);
    const stmts = items.map((it) =>
        db
            .prepare(`UPDATE shop_order_items SET status = ? WHERE round_date = ? AND user_key = ? AND card_id = ?`)
            .bind(status.get(`${it.userKey}|${it.cardId}`) || 'sold_out', round, it.userKey, it.cardId)
    );
    stmts.push(
        db.prepare(`INSERT OR IGNORE INTO shop_rounds (round_date, finalized_at) VALUES (?, ?)`).bind(round, new Date().toISOString())
    );
    await db.batch(stmts);
}

export async function GET(req: Request) {
    try {
        const db = getDb();
        await ensureShopSchema(db);
        const now = Date.now();
        const open = openRoundDate(now);
        const prev = previousRoundDate(open);
        const wanted = new URL(req.url).searchParams.get('round');
        const round = wanted && ROUND_RE.test(wanted) && (wanted === open || wanted === prev) ? wanted : open;
        const closed = isRoundClosed(round, now);
        if (closed) await finalizeRound(db, round);

        const { results } = await db
            .prepare(
                `SELECT o.user_key, u.name, o.card_id, o.price, o.color, o.is_black, o.title, o.member_name, o.image,
                        o.submitted_at, o.status
                 FROM shop_order_items o JOIN shop_users u ON u.user_key = o.user_key
                 WHERE o.round_date = ?`
            )
            .bind(round)
            .all();
        const rows: any[] = results || [];

        const items: OrderItem[] = rows.map((r) => ({
            userKey: String(r.user_key), cardId: Number(r.card_id), price: Number(r.price),
            isBlack: Number(r.is_black) === 1, submittedAt: String(r.submitted_at),
        }));
        const { ranking } = allocate(items, new Map()); // 只取排序；結單後的中籤狀態以資料庫為準
        const names = new Map<string, string>(rows.map((r) => [String(r.user_key), String(r.name)]));

        const participants = ranking.map((u, i) => ({
            rank: i + 1,
            name: names.get(u.userKey) || u.userKey,
            total: u.total,
            black: u.black,
            items: rows
                .filter((r) => String(r.user_key) === u.userKey)
                .sort((a, b) => Number(b.price) - Number(a.price))
                .map((r) => ({
                    cardId: Number(r.card_id), title: String(r.title), memberName: String(r.member_name),
                    image: String(r.image), price: Number(r.price), isBlack: Number(r.is_black) === 1,
                    color: String(r.color), status: closed ? String(r.status) : 'pending',
                })),
        }));

        return json({ round, closed, cutoffAt: cutoffMs(round), openRound: open, previousRound: prev, now, participants });
    } catch (e) {
        console.error('shop summary error', e);
        return fail('載入失敗，請稍後再試', 500);
    }
}
