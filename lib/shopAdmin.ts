// 後台專用：把 mycardshop 的訂單出貨，會動到既有的 ui_inventory / ui_sales / bulk_records 這些正式資料表。
// 跟 lib/shopServer.ts（只讀展示欄位、只寫 shop_ 表）刻意分開成獨立檔案，這樣一眼就知道
// 「這裡才是唯一會碰真實庫存/售出紀錄的地方」。只給 /api/shop-admin/* 這些後台路由用，
// 公開選購網站（/api/shop/*）完全不會 import 到這個檔案。

function todayStr(): string {
    return new Date().toISOString().split('T')[0];
}
function newId(prefix = ''): string {
    return `${prefix}${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export interface FulfillItemResult {
    cardId: number;
    requestedQty: number;
    shippedQty: number; // 實際找到幾張「到貨且未售出」的庫存標記為售出
}

// 「到貨」的定義與後台 App 一致：只要不是 未發貨／囤貨／未知 都算到貨（含沒設定狀態的舊資料）。
const ARRIVED_SQL = `(status IS NULL OR status NOT IN ('未發貨', '囤貨', '未知'))`;

/**
 * 把某位買家在某場次「中籤（won）」的小卡標記為已售出，流程比照後台既有的售出方式：
 *  - 每張卡挑「到貨、尚未售出、購入價最高」的庫存，依訂購數量取那麼多張，把 sell_price /
 *    sell_date 寫上去（status 不動；後台是靠 sell_price > 0 判斷已售出，不是靠 status）。
 *    一筆庫存若有好幾張（quantity > 1）而只需要其中幾張，會把那筆拆成「剩餘」與「售出」兩筆。
 *  - 若該筆庫存屬於某個盤收紀錄（bulk_record_id），同步更新盤收紀錄 items 裡對應項目的
 *    sellPrice / sellDate，跟後台編輯庫存時的同步行為一致。
 *  - 同時在 ui_sales 留一筆販售紀錄：該卡本來有在賣就扣掉賣出的張數；賣完了或本來就沒正式
 *    上架（POCA 換算的「待售」卡）就以 quantity=0、價格為成交價留下紀錄，跟現有資料裡
 *    「賣完的卡 quantity=0」的慣例一致。
 *  - 有實際標記到庫存的訂購項目會標成 'fulfilled'，避免重複出貨；一張都找不到庫存的項目維持
 *    'won'，讓補完庫存後可以再按一次。
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
    const bulkSold = new Map<string, Set<string>>(); // bulk_record_id -> 被整筆標記售出的庫存 id（以及它的售價）
    const bulkPrice = new Map<string, number>(); // 庫存 id -> 售價

    for (const item of items) {
        const { results: invRows } = await db
            .prepare(
                `SELECT id, quantity, bulk_record_id, buy_date, buy_price, source, condition, status, note,
                        album_id, album_status, album_quantity
                 FROM ui_inventory
                 WHERE card_id = ? AND ${ARRIVED_SQL} AND (sell_price IS NULL OR sell_price <= 0)
                 ORDER BY buy_price DESC`
            )
            .bind(item.cardId)
            .all();

        let need = item.qty;
        let shipped = 0;
        for (const row of invRows || []) {
            if (need <= 0) break;
            const rowQty = Math.max(1, Number(row.quantity) || 1);
            const take = Math.min(rowQty, need);

            if (take === rowQty) {
                stmts.push(db.prepare(`UPDATE ui_inventory SET sell_price = ?, sell_date = ? WHERE id = ?`).bind(item.price, today, row.id));
                if (row.bulk_record_id != null) {
                    const key = String(row.bulk_record_id);
                    if (!bulkSold.has(key)) bulkSold.set(key, new Set());
                    bulkSold.get(key)!.add(String(row.id));
                    bulkPrice.set(String(row.id), item.price);
                }
            } else {
                // 這筆庫存有多張、只需要其中幾張：原本那筆扣掉，另外新增一筆「售出」的
                stmts.push(db.prepare(`UPDATE ui_inventory SET quantity = ? WHERE id = ?`).bind(rowQty - take, row.id));
                stmts.push(
                    db
                        .prepare(
                            `INSERT INTO ui_inventory
                             (id, card_id, buy_date, sell_date, quantity, buy_price, sell_price, source, condition, status, note,
                              bulk_record_id, album_id, album_status, album_quantity)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`
                        )
                        .bind(
                            newId('inv_'), item.cardId, row.buy_date ?? null, today, take, row.buy_price ?? null, item.price,
                            row.source ?? null, row.condition ?? null, row.status ?? null, row.note ?? null,
                            row.album_id ?? null, row.album_status ?? null, row.album_quantity ?? null
                        )
                );
            }
            need -= take;
            shipped += take;
        }

        if (shipped > 0) {
            const activeSale = await db
                .prepare(
                    `SELECT id, quantity FROM ui_sales WHERE card_id = ? AND quantity > 0
                     AND rowid = (SELECT MAX(rowid) FROM ui_sales WHERE card_id = ? AND quantity > 0)`
                )
                .bind(item.cardId, item.cardId)
                .first();
            if (activeSale) {
                const remaining = Math.max(0, Number(activeSale.quantity) - shipped);
                stmts.push(db.prepare(`UPDATE ui_sales SET quantity = ?, price = ? WHERE id = ?`).bind(remaining, item.price, activeSale.id));
            } else {
                stmts.push(
                    db
                        .prepare(`INSERT INTO ui_sales (id, card_id, quantity, price, date, color) VALUES (?, ?, 0, ?, ?, ?)`)
                        .bind(newId(), item.cardId, item.price, today, 'bg-black/70')
                );
            }
            stmts.push(
                db
                    .prepare(`UPDATE shop_order_items SET status = 'fulfilled' WHERE round_date = ? AND user_key = ? AND card_id = ?`)
                    .bind(round, userKey, item.cardId)
            );
        }
        results.push({ cardId: item.cardId, requestedQty: item.qty, shippedQty: shipped });
    }

    // 盤收紀錄：items 是 JSON，裡面每個項目的 id 對應庫存 id，同步把售價/售出日寫進去
    for (const [bulkId, invIds] of bulkSold) {
        const rec = await db.prepare(`SELECT items FROM bulk_records WHERE id = ?`).bind(bulkId).first();
        if (!rec?.items) continue;
        let parsed: any;
        try {
            parsed = typeof rec.items === 'string' ? JSON.parse(rec.items) : rec.items;
        } catch {
            continue;
        }
        if (!Array.isArray(parsed)) continue;
        const next = parsed.map((it: any) =>
            invIds.has(String(it?.id)) ? { ...it, sellPrice: bulkPrice.get(String(it.id)), sellDate: today } : it
        );
        stmts.push(db.prepare(`UPDATE bulk_records SET items = ? WHERE id = ?`).bind(JSON.stringify(next), bulkId));
    }

    if (stmts.length > 0) await db.batch(stmts);
    return { results };
}
