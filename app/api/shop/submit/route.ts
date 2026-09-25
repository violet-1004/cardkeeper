import { getDb, ensureShopSchema, json, fail, authUser, clientIp, rateLimit, loadOnSaleCards } from '@/lib/shopServer';
import { openRoundDate, isBlackColor } from '@/lib/shop';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// 送出購物車 = 確認購買。價格/名稱以送出當下的販售資料為準（快照），不採用前端傳來的數值。
export async function POST(req: Request) {
    try {
        const db = getDb();
        await ensureShopSchema(db);
        const user = await authUser(req, db);
        if (!user) return fail('請先輸入 FB 帳號名', 401);
        if (!(await rateLimit(db, 'submit', clientIp(req), 20, 60))) return fail('操作太頻繁，請稍後再試', 429);

        const { results: cartRows } = await db.prepare(`SELECT card_id FROM shop_carts WHERE user_key = ?`).bind(user.userKey).all();
        const cartIds = new Set<number>((cartRows || []).map((r: any) => Number(r.card_id)));
        if (cartIds.size === 0) return fail('購物車是空的');

        const { cards } = await loadOnSaleCards(db);
        const onSale = new Map(cards.map((c) => [c.id, c]));
        const now = Date.now();
        const round = openRoundDate(now);
        const iso = new Date(now).toISOString();

        const valid: number[] = [];
        const skipped: number[] = [];
        for (const id of cartIds) (onSale.has(id) ? valid : skipped).push(id);
        if (valid.length === 0) {
            await db.prepare(`DELETE FROM shop_carts WHERE user_key = ?`).bind(user.userKey).run();
            return fail('購物車內的小卡都已下架', 409);
        }

        await db.batch([
            ...valid.map((id) => {
                const c = onSale.get(id)!;
                return db
                    .prepare(
                        `INSERT OR IGNORE INTO shop_order_items
                         (round_date, user_key, card_id, price, color, is_black, title, member_name, image, submitted_at)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
                    )
                    .bind(round, user.userKey, id, c.price, c.color, isBlackColor(c.color) ? 1 : 0, c.title, c.memberName, c.image, iso);
            }),
            db.prepare(`DELETE FROM shop_carts WHERE user_key = ?`).bind(user.userKey),
        ]);
        return json({ ok: true, round, submitted: valid, skipped });
    } catch (e) {
        console.error('shop submit error', e);
        return fail('送出失敗，請稍後再試', 500);
    }
}
