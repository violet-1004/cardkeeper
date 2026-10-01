import { getDb, ensureShopSchema, json, fail } from '@/lib/shopServer';
import { openRoundDate } from '@/lib/shop';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// 後台專用：列出有訂單資料的場次日期，給日期切換用。跟 /api/shop/* 不同，這裡不開放給公開選購網站。
export async function GET() {
    try {
        const db = getDb();
        await ensureShopSchema(db);
        const { results } = await db
            .prepare(`SELECT DISTINCT round_date FROM shop_order_items ORDER BY round_date DESC LIMIT 60`)
            .all();
        const rounds = (results || []).map((r: any) => String(r.round_date));
        const today = openRoundDate(Date.now());
        if (!rounds.includes(today)) rounds.unshift(today);
        return json({ rounds });
    } catch (e) {
        console.error('shop-admin rounds error', e);
        return fail('載入失敗', 500);
    }
}
