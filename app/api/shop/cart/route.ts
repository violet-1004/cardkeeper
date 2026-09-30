import { getDb, ensureShopSchema, json, fail, readJson, authUser, clientIp, rateLimit } from '@/lib/shopServer';
import { MAX_CART_ITEMS } from '@/lib/shop';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const MAX_QTY = 999; // 寬鬆上限；每張卡真正可買到的數量以送出當下的庫存為準

// 購物車暫存在伺服器（依帳號名），換頁/重新整理不會消失
export async function GET(req: Request) {
    try {
        const db = getDb();
        await ensureShopSchema(db);
        const user = await authUser(req, db);
        if (!user) return fail('請先輸入 FB 帳號名', 401);
        const { results } = await db
            .prepare(`SELECT card_id, qty FROM shop_carts WHERE user_key = ? ORDER BY added_at, card_id`)
            .bind(user.userKey)
            .all();
        return json({ items: (results || []).map((r: any) => ({ cardId: Number(r.card_id), qty: Number(r.qty) || 1 })) });
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
        const items = body?.items;
        if (!Array.isArray(items) || items.length > MAX_CART_ITEMS) return fail('購物車內容不正確');

        const byId = new Map<number, number>();
        for (const it of items) {
            const cardId = Number(it?.cardId);
            const qty = Number(it?.qty);
            if (!Number.isSafeInteger(cardId) || cardId <= 0) return fail('購物車內容不正確');
            if (!Number.isSafeInteger(qty) || qty < 1 || qty > MAX_QTY) return fail('購物車內容不正確');
            byId.set(cardId, qty);
        }

        const now = new Date().toISOString();
        await db.batch([
            db.prepare(`DELETE FROM shop_carts WHERE user_key = ?`).bind(user.userKey),
            ...[...byId.entries()].map(([cardId, qty]) =>
                db.prepare(`INSERT INTO shop_carts (user_key, card_id, qty, added_at) VALUES (?, ?, ?, ?)`).bind(user.userKey, cardId, qty, now)
            ),
        ]);
        return json({ ok: true, items: [...byId.entries()].map(([cardId, qty]) => ({ cardId, qty })) });
    } catch (e) {
        console.error('shop cart put error', e);
        return fail('儲存失敗', 500);
    }
}
