import { getDb, ensureShopSchema, json, fail, loadOnSaleCards } from '@/lib/shopServer';
import { openRoundDate, cutoffMs } from '@/lib/shop';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// 公開、唯讀：只回傳販售中小卡的展示欄位
export async function GET() {
    try {
        const db = getDb();
        await ensureShopSchema(db);
        const { cards, meta } = await loadOnSaleCards(db);
        const now = Date.now();
        const round = openRoundDate(now);
        return json({ cards, ...meta, round, cutoffAt: cutoffMs(round), now }, 200, {
            'Cache-Control': 'public, max-age=10',
        });
    } catch (e) {
        console.error('shop catalog error', e);
        return fail('載入失敗，請稍後再試', 500);
    }
}
