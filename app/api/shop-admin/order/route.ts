import { getDb, ensureShopSchema, json, fail, readJson } from '@/lib/shopServer';
import { ROUND_RE } from '@/lib/shop';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// 後台專用：刪除某位買家在某場次的全部購買資料。
export async function DELETE(req: Request) {
    try {
        const db = getDb();
        await ensureShopSchema(db);
        const body = await readJson(req, 512);
        const round = body?.round;
        const userKey = body?.userKey;
        if (typeof round !== 'string' || !ROUND_RE.test(round)) return fail('場次格式不正確');
        if (typeof userKey !== 'string' || !userKey) return fail('缺少買家');

        await db.prepare(`DELETE FROM shop_order_items WHERE round_date = ? AND user_key = ?`).bind(round, userKey).run();
        return json({ ok: true });
    } catch (e) {
        console.error('shop-admin order delete error', e);
        return fail('刪除失敗', 500);
    }
}
