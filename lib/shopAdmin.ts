// 後台專用：把 mycardshop 的訂單出貨，會動到既有的 ui_inventory / ui_sales 兩張正式資料表。
// 跟 lib/shopServer.ts（只讀展示欄位、只寫 shop_ 表）刻意分開成獨立檔案，這樣一眼就知道
// 「這裡才是唯一會碰真實庫存/售出紀錄的地方」。只給 /api/shop-admin/* 這些後台路由用，
// 公開選購網站（/api/shop/*）完全不會 import 到這個檔案。

function todayStr(): string {
    return new Date().toISOString().split('T')[0];
}
function newId(): string {
    return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export interface FulfillItemResult {
    cardId: number;
    requestedQty: number;
    shippedQty: number; // 實際找到幾筆「到貨且未售出」的庫存可以標記售出
}

/**
 * 把某位買家在某場次「中籤（won）」的小卡標記為已售出：
 *  - 每張卡挑「狀態=到貨、尚未售出、購入價最高」的庫存，依訂購數量挑那麼多筆，把
 *    sell_price/sell_date 寫上去（status 維持不變，比照後台既有的售出判斷方式：
 *    看 sell_price > 0，不是看 status）。
 *  - 同時在 ui_sales 留一筆販售紀錄：若該卡本來就有在賣，扣掉賣出的數量；賣完了
 *    （或該卡本來就沒有正式上架，只是「待售」POCA 換算卡）就以 quantity=0、價格為
 *    成交價的方式留下紀錄，跟現有資料裡「賣完的卡 quantity=0」的慣例一致。
 *  - 處理完的訂購項目會標成 status='fulfilled'，避免重複出貨扣兩次庫存。
 */
export async function fulfillBuyerOrders(
    db: any,
    round: string,
    userKey: string
): Promise<{ results: FulfillItemResult[] }> {
    const { results: itemRows } = await db
        .prepare(`SELECT card_id, qty, price FROM shop_order_items WHERE round_date = ? AND user_key = ? AND status = 'won'`)
        .bind(round, userKey)
        .all();
    const items = (itemRows || []).map((r: any) => ({ cardId: Number(r.card_id), qty: Number(r.qty) || 1, price: Number(r.price) }));
    if (items.length === 0) return { results: [] };

    const today = todayStr();
    const stmts: any[] = [];
    const results: FulfillItemResult[] = [];

    for (const item of items) {
        const { results: invRows } = await db
            .prepare(
                `SELECT id FROM ui_inventory
                 WHERE card_id = ? AND status = '到貨' AND (sell_price IS NULL OR sell_price <= 0)
                 ORDER BY buy_price DESC
                 LIMIT ?`
            )
            .bind(item.cardId, item.qty)
            .all();
        const invIds: string[] = (invRows || []).map((r: any) => String(r.id));

        for (const id of invIds) {
            stmts.push(db.prepare(`UPDATE ui_inventory SET sell_price = ?, sell_date = ? WHERE id = ?`).bind(item.price, today, id));
        }

        if (invIds.length > 0) {
            const activeSale = await db
                .prepare(
                    `SELECT id, quantity FROM ui_sales WHERE card_id = ? AND quantity > 0
                     AND rowid = (SELECT MAX(rowid) FROM ui_sales WHERE card_id = ? AND quantity > 0)`
                )
                .bind(item.cardId, item.cardId)
                .first();
            if (activeSale) {
                const remaining = Math.max(0, Number(activeSale.quantity) - invIds.length);
                stmts.push(db.prepare(`UPDATE ui_sales SET quantity = ?, price = ? WHERE id = ?`).bind(remaining, item.price, activeSale.id));
            } else {
                stmts.push(
                    db
                        .prepare(`INSERT INTO ui_sales (id, card_id, quantity, price, date, color) VALUES (?, ?, 0, ?, ?, ?)`)
                        .bind(newId(), item.cardId, item.price, today, 'bg-black/70')
                );
            }
        }

        stmts.push(
            db
                .prepare(`UPDATE shop_order_items SET status = 'fulfilled' WHERE round_date = ? AND user_key = ? AND card_id = ?`)
                .bind(round, userKey, item.cardId)
        );
        results.push({ cardId: item.cardId, requestedQty: item.qty, shippedQty: invIds.length });
    }

    await db.batch(stmts);
    return { results };
}
