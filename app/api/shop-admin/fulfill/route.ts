import { getDb, ensureShopSchema, json, fail, readJson } from '@/lib/shopServer';
import { fulfillBuyerOrders } from '@/lib/shopAdmin';
import { ROUND_RE } from '@/lib/shop';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// 後台專用：一鍵把某位買家「中籤」的小卡標記售出（寫入 ui_inventory.sell_price 與 ui_sales）。
export async function POST(req: Request) {
    try {
        const db = getDb();
        await ensureShopSchema(db);
        const body = await readJson(req, 512);
        const round = body?.round;
        const userKey = body?.userKey;
        if (typeof round !== 'string' || !ROUND_RE.test(round)) return fail('場次格式不正確');
        if (typeof userKey !== 'string' || !userKey) return fail('缺少買家');

        const { results } = await fulfillBuyerOrders(db, round, userKey);
        return json({ ok: true, results });
    } catch (e) {
        console.error('shop-admin fulfill error', e);
        return fail('出貨失敗，請稍後再試', 500);
    }
}
