import { getDb, ensureShopSchema, json, fail, loadOnSaleCards, cachedJson } from '@/lib/shopServer';
import { openRoundDate, cutoffMs } from '@/lib/shop';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// 公開、唯讀：只回傳販售中小卡的展示欄位。短暫快取在 Edge，降低 D1 讀取列數。
export async function GET(req: Request) {
    return cachedJson(req, 20, async () => {
        try {
            const db = getDb();
            await ensureShopSchema(db);
            const { cards, meta } = await loadOnSaleCards(db);
            const now = Date.now();
            const round = openRoundDate(now);
            return json({ cards, ...meta, round, cutoffAt: cutoffMs(round), now });
        } catch (e) {
            console.error('shop catalog error', e);
            return fail('載入失敗，請稍後再試', 500);
        }
    });
}
