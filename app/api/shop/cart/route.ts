import { getDb, ensureShopSchema, json, fail, readJson, authUser, clientIp, rateLimit } from '@/lib/shopServer';
import { MAX_CART_ITEMS } from '@/lib/shop';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// 購物車暫存在伺服器（依帳號名），換頁/重新整理不會消失
export async function GET(req: Request) {
    try {
        const db = getDb();
        await ensureShopSchema(db);
        const user = await authUser(req, db);
        if (!user) return fail('請先輸入 FB 帳號名', 401);
        const { results } = await db
            .prepare(`SELECT card_id FROM shop_carts WHERE user_key = ? ORDER BY added_at, card_id`)
            .bind(user.userKey)
            .all();
        return json({ cardIds: (results || []).map((r: any) => Number(r.card_id)) });
    } catch (e) {
        console.error('shop cart get error', e);
        return fail('載入失敗', 500);
    }
}

export async function PUT(req: Request) {
    try {
        const db = getDb();
        await ensureShopSchema(db);
        const user = await authUser(req, db);
        if (!user) return fail('請先輸入 FB 帳號名', 401);
        if (!(await rateLimit(db, 'cart', clientIp(req), 120, 60))) return fail('操作太頻繁，請稍後再試', 429);

        const body = await readJson(req);
        const ids = body?.cardIds;
        if (!Array.isArray(ids) || ids.length > MAX_CART_ITEMS) return fail('購物車內容不正確');
        const clean = [...new Set(ids.map(Number))];
        if (clean.some((n) => !Number.isSafeInteger(n) || n <= 0)) return fail('購物車內容不正確');

        const now = new Date().toISOString();
        await db.batch([
            db.prepare(`DELETE FROM shop_carts WHERE user_key = ?`).bind(user.userKey),
            ...clean.map((id) =>
                db.prepare(`INSERT INTO shop_carts (user_key, card_id, added_at) VALUES (?, ?, ?)`).bind(user.userKey, id, now)
            ),
        ]);
        return json({ ok: true, cardIds: clean });
    } catch (e) {
        console.error('shop cart put error', e);
        return fail('儲存失敗', 500);
    }
}
