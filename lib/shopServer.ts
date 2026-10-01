// 對外選購網站的伺服器端工具。
// 安全原則：
//  - 只讀取展示欄位（不含成本、備註、買家等原始資料），poca/ui_settings 也是唯讀
//  - 只寫入 shop_ 開頭的獨立資料表，絕不寫入既有資料表
//  - 所有 SQL 都用 bind 參數，不拼接使用者輸入
import { getRequestContext } from '@cloudflare/next-on-pages';
import { NextResponse } from 'next/server';
import { nameKey, normalizeName, MAX_NAME_LENGTH, UNLISTED_COLOR, allocate, type OrderItem } from './shop';

export function getDb(): any {
    const env = getRequestContext().env as any;
    if (!env?.DB) throw new Error('DB binding missing');
    return env.DB;
}

/**
 * D1 的「讀取列數」計費/配額很容易被選購網站的輪詢打滿：每個人每隔幾十秒就重新查一次
 * 全部販售中小卡 + 一堆關聯表。這裡用 Workers 內建、免費的 Edge Cache API 把同一個網址的
 * GET 回應短暫快取幾秒～幾十秒，同一個快取視窗內不管幾個人同時打進來，D1 只會被查一次。
 * 不影響正確性的前提：這些資料本來就不要求即時到秒，前端本身也是每隔一段時間才輪詢一次。
 */
export async function cachedJson(req: Request, ttlSeconds: number, compute: () => Promise<Response>): Promise<Response> {
    const cache = (caches as any).default;
    const cacheKey = new Request(req.url, { method: 'GET' });
    try {
        const hit = await cache.match(cacheKey);
        if (hit) return hit;
    } catch {
        /* Cache API 不可用時直接算，不影響功能 */
    }

    const res = await compute();
    if (!res.ok) return res;

    const toCache = new Response(res.body, res);
    toCache.headers.set('Cache-Control', `public, max-age=${ttlSeconds}`);
    try {
        const ctx = getRequestContext().ctx as any;
        const putPromise = cache.put(cacheKey, toCache.clone());
        if (ctx?.waitUntil) ctx.waitUntil(putPromise);
        else await putPromise;
    } catch {
        /* 快取寫入失敗就算了，不影響這次回應 */
    }
    return toCache;
}

let schemaReady: Promise<void> | null = null;
export function ensureShopSchema(db: any): Promise<void> {
    if (!schemaReady) {
        schemaReady = (async () => {
            await db.batch([
                db.prepare(`CREATE TABLE IF NOT EXISTS shop_users (
                    user_key TEXT PRIMARY KEY, name TEXT NOT NULL, token_hash TEXT NOT NULL, created_at TEXT NOT NULL)`),
                db.prepare(`CREATE TABLE IF NOT EXISTS shop_carts (
                    user_key TEXT NOT NULL, card_id INTEGER NOT NULL, qty INTEGER NOT NULL DEFAULT 1, added_at TEXT NOT NULL,
                    PRIMARY KEY (user_key, card_id))`),
                db.prepare(`CREATE TABLE IF NOT EXISTS shop_order_items (
                    round_date TEXT NOT NULL, user_key TEXT NOT NULL, card_id INTEGER NOT NULL,
                    qty INTEGER NOT NULL DEFAULT 1, price INTEGER NOT NULL, color TEXT NOT NULL, is_black INTEGER NOT NULL,
                    group_id INTEGER, title TEXT NOT NULL, member_name TEXT NOT NULL, image TEXT NOT NULL,
                    submitted_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
                    PRIMARY KEY (round_date, user_key, card_id))`),
                db.prepare(`CREATE TABLE IF NOT EXISTS shop_rounds (
                    round_date TEXT PRIMARY KEY, finalized_at TEXT NOT NULL)`),
                db.prepare(`CREATE TABLE IF NOT EXISTS shop_rate (
                    k TEXT PRIMARY KEY, n INTEGER NOT NULL, exp INTEGER NOT NULL)`),
            ]);
            // 舊資料表（第一版沒有這些欄位）逐一補欄位；已存在就吃掉錯誤，維持可重複執行。
            for (const stmt of [
                `ALTER TABLE shop_carts ADD COLUMN qty INTEGER NOT NULL DEFAULT 1`,
                `ALTER TABLE shop_order_items ADD COLUMN qty INTEGER NOT NULL DEFAULT 1`,
                `ALTER TABLE shop_order_items ADD COLUMN group_id INTEGER`,
            ]) {
                try {
                    await db.prepare(stmt).run();
                } catch {
                    /* 欄位已存在 */
                }
            }
        })().catch((e: unknown) => {
            schemaReady = null;
            throw e;
        });
    }
    return schemaReady as Promise<void>;
}

export function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
    return NextResponse.json(body, {
        status,
        headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extraHeaders },
    });
}

export const fail = (message: string, status = 400) => json({ error: message }, status);

/** 讀取 JSON body，限制大小避免被塞爆。 */
export async function readJson(req: Request, maxBytes = 16 * 1024): Promise<any | null> {
    const len = Number(req.headers.get('content-length') || 0);
    if (len > maxBytes) return null;
    try {
        const text = await req.text();
        if (text.length > maxBytes) return null;
        return JSON.parse(text);
    } catch {
        return null;
    }
}

export function clientIp(req: Request): string {
    return req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

/** 簡易固定視窗限流（存在 D1）。回傳 true 代表放行。 */
export async function rateLimit(db: any, bucket: string, ip: string, limit: number, windowSec: number): Promise<boolean> {
    const now = Date.now();
    const row = await db
        .prepare(
            `INSERT INTO shop_rate (k, n, exp) VALUES (?1, 1, ?2)
             ON CONFLICT(k) DO UPDATE SET
               n = CASE WHEN exp < ?3 THEN 1 ELSE n + 1 END,
               exp = CASE WHEN exp < ?3 THEN ?2 ELSE exp END
             RETURNING n`
        )
        .bind(`${bucket}:${ip}`, now + windowSec * 1000, now)
        .first();
    if (Math.random() < 0.02) {
        await db.prepare(`DELETE FROM shop_rate WHERE exp < ?`).bind(now).run();
    }
    return Number(row?.n ?? 1) <= limit;
}

export async function sha256Hex(text: string): Promise<string> {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function randomToken(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function safeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}

/** 以 header 中的名稱 + 裝置 token 驗證身分（名稱第一次登記時綁定 token，防止他人冒名操作購物車/訂單）。 */
export async function authUser(req: Request, db: any): Promise<{ userKey: string; name: string } | null> {
    const rawName = req.headers.get('x-shop-user');
    const token = req.headers.get('x-shop-token') || '';
    let decoded = rawName;
    try {
        decoded = rawName ? decodeURIComponent(rawName) : null;
    } catch {
        return null;
    }
    const name = normalizeName(decoded);
    if (!name || token.length < 32 || token.length > 128) return null;
    const row = await db.prepare(`SELECT name, token_hash FROM shop_users WHERE user_key = ?`).bind(nameKey(name)).first();
    if (!row) return null;
    const hash = await sha256Hex(token);
    if (!safeEqual(hash, String(row.token_hash))) return null;
    return { userKey: nameKey(name), name: String(row.name) };
}

// ---------- 展示用小卡（只讀、只取展示欄位） ----------
export interface ShopCard {
    id: number;
    image: string;
    title: string;
    memberName: string;
    groupId: number | null;
    memberIds: number[];
    seriesId: number | null;
    subunit: string | null;
    typeName: string | null;
    channelName: string | null;
    price: number;
    color: string;
    quantity: number;
}

const clip = (v: unknown, n = 300) => (typeof v === 'string' ? v.slice(0, n) : v == null ? '' : String(v).slice(0, n));
const nullish = (v: unknown) => v == null || v === 'null' || v === 'undefined' || v === '';

interface CardMetaMaps {
    memberMap: Map<number, any>;
    seriesMap: Map<number, any>;
    batchMap: Map<number, any>;
    channelMap: Map<string, any>;
    typeMap: Map<string, any>;
}

function buildCardMeta(row: any, maps: CardMetaMaps) {
    let subIds: number[] = [];
    try {
        const parsed = typeof row.member_id2 === 'string' ? JSON.parse(row.member_id2) : row.member_id2;
        if (Array.isArray(parsed)) subIds = parsed.map(Number).filter((n) => Number.isInteger(n));
    } catch {
        /* member_id2 格式不合就忽略 */
    }
    const main = maps.memberMap.get(Number(row.member_id));
    const names = [main?.name, ...subIds.map((id) => maps.memberMap.get(id)?.name)].filter(Boolean);
    const ser = maps.seriesMap.get(Number(row.series_id));
    const bat = maps.batchMap.get(Number(row.batch_id));
    const typeObj = nullish(row.type) ? null : maps.typeMap.get(String(row.type));
    const chObj = nullish(row.channel) ? null : maps.channelMap.get(String(row.channel));
    const typeName = nullish(row.type) ? null : String(typeObj ? typeObj.short_name || typeObj.name : row.type);
    const channelName = nullish(row.channel) ? null : String(chObj ? chObj.short_name || chObj.name : row.channel);
    const batchNumber = bat && !nullish(bat.batch_number) ? String(bat.batch_number) : null;
    const title = [ser ? ser.short_name || ser.name : null, [channelName, batchNumber].filter(Boolean).join(''), typeName]
        .filter(Boolean)
        .join(' ');
    return {
        image: clip(row.image, 500),
        title: clip(title || '未命名卡片', 120),
        memberName: clip(names.join('\\'), 120),
        groupId: row.group_id == null ? null : Number(row.group_id),
        memberIds: [Number(row.member_id), ...subIds].filter((n) => Number.isInteger(n)),
        seriesId: row.series_id == null ? null : Number(row.series_id),
        subunit: main?.subunit || ser?.subunit || null,
        typeName,
        channelName,
    };
}

/** POCA 韓幣換算台幣：[(POCA₩ / a) + 6] * b + c；缺任一設定就回傳 null（與後台換算邏輯一致）。 */
function convertPocaKrwToTwd(krw: number, rates: { a: number; b: number; c: number } | null): number | null {
    if (!rates) return null;
    return (krw / rates.a + 6) * rates.b + rates.c;
}
const roundUpToFive = (n: number) => Math.ceil(n / 5) * 5;

export async function loadOnSaleCards(db: any): Promise<{ cards: ShopCard[]; meta: any }> {
    // 與後台一致：同一張卡多筆販售紀錄時取最後一筆（quantity > 0）
    const [salesRes, members, series, batches, channels, types, subunits, groups] = await db.batch([
        db.prepare(
            `SELECT s.card_id, s.quantity, s.price, s.color,
                    c.group_id, c.member_id, c.member_id2, c.series_id, c.batch_id, c.type, c.channel, c.image
             FROM ui_sales s JOIN ui_cards c ON c.id = s.card_id
             WHERE s.quantity > 0 AND s.price > 0
               AND s.rowid = (SELECT MAX(rowid) FROM ui_sales WHERE card_id = s.card_id AND quantity > 0)`
        ),
        db.prepare(`SELECT id, group_id, name, image, sort_order, subunit FROM members`),
        db.prepare(`SELECT id, group_id, name, short_name, type, subunit FROM series`),
        db.prepare(`SELECT id, series_id, batch_number FROM batches`),
        db.prepare(`SELECT id, name, short_name FROM channels`),
        db.prepare(`SELECT id, name, short_name, sort_order FROM types`),
        db.prepare(`SELECT id, group_id, name, sort_order FROM ui_subunits`),
        db.prepare(`SELECT id, name FROM groups`),
    ]);

    const maps: CardMetaMaps = {
        memberMap: new Map((members.results || []).map((m: any) => [Number(m.id), m])),
        seriesMap: new Map((series.results || []).map((s: any) => [Number(s.id), s])),
        batchMap: new Map((batches.results || []).map((b: any) => [Number(b.id), b])),
        channelMap: byIdOrName(channels.results || []),
        typeMap: byIdOrName(types.results || []),
    };
    function byIdOrName(rows: any[]) {
        const m = new Map<string, any>();
        for (const r of rows) {
            m.set(String(r.id), r);
            if (r.name != null) m.set(String(r.name), r);
        }
        return m;
    }

    const listedIds = new Set<number>();
    const cards: ShopCard[] = (salesRes.results || []).map((r: any) => {
        listedIds.add(Number(r.card_id));
        return {
            id: Number(r.card_id),
            ...buildCardMeta(r, maps),
            price: Number(r.price),
            color: clip(r.color, 40) || 'bg-black/70',
            quantity: Number(r.quantity),
        };
    });

    // 待售（POCA 換算價）：到貨庫存 >= 1、目前沒在販售中、有對照 POCA 且非未售（₩0）的小卡，
    // 一併併入選購清單，價格用綠色標籤跟正式販售區分。任何一步失敗都不影響上面已經算好的正式販售清單。
    try {
        const [arrivedRes, pocaRes, rateRes] = await db.batch([
            db.prepare(
                `SELECT card_id, SUM(COALESCE(quantity, 1)) AS qty FROM ui_inventory
                 WHERE (sell_price IS NULL OR sell_price <= 0)
                   AND (status IS NULL OR status NOT IN ('未發貨', '囤貨', '未知'))
                 GROUP BY card_id`
            ),
            db.prepare(`SELECT id, price FROM poca`),
            db.prepare(`SELECT key, value FROM ui_settings WHERE key IN ('poca_rate_a', 'poca_rate_b', 'poca_price_diff_c')`),
        ]);

        const rateMap = new Map((rateRes.results || []).map((r: any) => [String(r.key), r.value]));
        const a = Number(rateMap.get('poca_rate_a'));
        const b = Number(rateMap.get('poca_rate_b'));
        const c = Number(rateMap.get('poca_price_diff_c'));
        const rates = rateMap.has('poca_rate_a') && rateMap.has('poca_rate_b') && rateMap.has('poca_price_diff_c') && !isNaN(a) && !isNaN(b) && !isNaN(c) && a !== 0 ? { a, b, c } : null;

        const arrivedRows = (arrivedRes.results || []).filter((r: any) => !listedIds.has(Number(r.card_id)) && Number(r.qty) >= 1);
        if (rates && arrivedRows.length > 0) {
            const pocaPriceById = new Map<number, number>((pocaRes.results || []).map((p: any) => [Number(p.id), Number(p.price) || 0]));
            const candidateIds = arrivedRows.map((r: any) => Number(r.card_id));
            const cardRowsById = new Map<number, any>();
            for (let i = 0; i < candidateIds.length; i += 50) {
                const chunk = candidateIds.slice(i, i + 50);
                const marks = chunk.map(() => '?').join(',');
                const { results } = await db
                    .prepare(
                        `SELECT id, group_id, member_id, member_id2, series_id, batch_id, type, channel, image, poco_id
                         FROM ui_cards WHERE id IN (${marks})`
                    )
                    .bind(...chunk)
                    .all();
                for (const r of results || []) cardRowsById.set(Number(r.id), r);
            }

            for (const row of arrivedRows) {
                const cardId = Number(row.card_id);
                const cardRow = cardRowsById.get(cardId);
                if (!cardRow || cardRow.poco_id == null) continue;
                const krw = pocaPriceById.get(Number(cardRow.poco_id));
                if (!krw || krw <= 0) continue; // 沒對照到，或 POCA 標示未售（₩0）
                const twd = convertPocaKrwToTwd(krw, rates);
                if (twd === null) continue;
                cards.push({
                    id: cardId,
                    ...buildCardMeta(cardRow, maps),
                    price: roundUpToFive(twd),
                    color: UNLISTED_COLOR,
                    quantity: Number(row.qty),
                });
            }
        }
    } catch (e) {
        console.error('unlisted (待售) cards unavailable, showing listed cards only', e);
    }

    const meta = {
        groups: (groups.results || []).map((g: any) => ({ id: Number(g.id), name: clip(g.name, 60) })),
        members: (members.results || []).map((m: any) => ({
            id: Number(m.id), groupId: m.group_id == null ? null : Number(m.group_id), name: clip(m.name, 60),
            subunit: m.subunit ? clip(m.subunit, 60) : null, sortOrder: Number(m.sort_order) || 0,
        })),
        series: (series.results || []).map((s: any) => ({
            id: Number(s.id), groupId: s.group_id == null ? null : Number(s.group_id), name: clip(s.short_name || s.name, 80),
        })),
        subunits: (subunits.results || []).map((s: any) => ({
            groupId: s.group_id == null ? null : Number(s.group_id), name: clip(s.name, 60), sortOrder: Number(s.sort_order) || 0,
        })),
    };
    return { cards, meta };
}

/** 依團體名稱找 id（忽略大小寫/前後空白），對應 /shop/<團體> 這類網址。找不到回傳 null。 */
export async function resolveGroupId(db: any, name: string): Promise<number | null> {
    const target = name.trim().toLowerCase();
    if (!target) return null;
    const { results } = await db.prepare(`SELECT id, name FROM groups`).all();
    const hit = (results || []).find((g: any) => String(g.name).trim().toLowerCase() === target);
    return hit ? Number(hit.id) : null;
}

/** 結單時查目前庫存：優先看販售紀錄的數量，沒有販售紀錄（待售/POCA 換算卡）就用到貨庫存數。 */
export async function getStockForCards(db: any, cardIds: number[]): Promise<Map<number, number>> {
    const stock = new Map<number, number>();
    const uniqueIds = [...new Set(cardIds)];
    for (let i = 0; i < uniqueIds.length; i += 50) {
        const chunk = uniqueIds.slice(i, i + 50);
        const marks = chunk.map(() => '?').join(',');
        const [salesRes, invRes] = await db.batch([
            db
                .prepare(
                    `SELECT s.card_id, s.quantity FROM ui_sales s
                     WHERE s.card_id IN (${marks}) AND s.quantity > 0
                       AND s.rowid = (SELECT MAX(rowid) FROM ui_sales WHERE card_id = s.card_id AND quantity > 0)`
                )
                .bind(...chunk),
            db
                .prepare(
                    `SELECT card_id, SUM(COALESCE(quantity, 1)) AS qty FROM ui_inventory
                     WHERE card_id IN (${marks})
                       AND (sell_price IS NULL OR sell_price <= 0)
                       AND (status IS NULL OR status NOT IN ('未發貨', '囤貨', '未知'))
                     GROUP BY card_id`
                )
                .bind(...chunk),
        ]);
        const listed = new Set<number>();
        for (const r of salesRes.results || []) {
            stock.set(Number(r.card_id), Number(r.quantity));
            listed.add(Number(r.card_id));
        }
        for (const r of invRes.results || []) {
            const id = Number(r.card_id);
            if (!listed.has(id)) stock.set(id, Number(r.qty));
        }
    }
    return stock;
}

// ---------- 結單分配（公開總結頁與後台「商店」分頁共用） ----------
export interface RoundOrderRow {
    userKey: string;
    name: string;
    cardId: number;
    qty: number;
    price: number;
    color: string;
    isBlack: boolean;
    groupId: number | null;
    title: string;
    memberName: string;
    image: string;
    submittedAt: string;
    status: string;
}

/**
 * 結單後第一次有人查看時，依順位把庫存分給順位前面的人，寫進 shop_order_items.status。
 * 排序與分配都是「每個團體自己一組」：某人在 A 團體排第幾名、能不能搶到卡，只看他在 A 團體的
 * 金額，不受他在其他團體買了多少影響。重複執行結果一致，公開總結頁與後台都可以放心呼叫。
 */
export async function finalizeRoundIfClosed(db: any, round: string): Promise<void> {
    const done = await db.prepare(`SELECT 1 AS ok FROM shop_rounds WHERE round_date = ?`).bind(round).first();
    if (done) return;

    const { results: rows } = await db
        .prepare(`SELECT user_key, card_id, qty, price, is_black, group_id, submitted_at FROM shop_order_items WHERE round_date = ?`)
        .bind(round)
        .all();
    const items: OrderItem[] = (rows || []).map((r: any) => ({
        userKey: String(r.user_key),
        cardId: Number(r.card_id),
        qty: Number(r.qty) || 1,
        price: Number(r.price),
        isBlack: Number(r.is_black) === 1,
        submittedAt: String(r.submitted_at),
        groupId: r.group_id == null ? null : Number(r.group_id),
    }));
    if (items.length === 0) return;

    const stock = await getStockForCards(db, items.map((i) => i.cardId));

    const byGroup = new Map<string | number, OrderItem[]>();
    for (const it of items) {
        const key = it.groupId ?? 'null';
        const list = byGroup.get(key);
        if (list) list.push(it);
        else byGroup.set(key, [it]);
    }

    const status = new Map<string, 'won' | 'sold_out'>();
    for (const groupItems of byGroup.values()) {
        const { status: groupStatus } = allocate(groupItems, stock);
        for (const [k, v] of groupStatus) status.set(k, v);
    }

    const stmts = items.map((it) =>
        db
            .prepare(`UPDATE shop_order_items SET status = ? WHERE round_date = ? AND user_key = ? AND card_id = ?`)
            .bind(status.get(`${it.userKey}|${it.cardId}`) || 'sold_out', round, it.userKey, it.cardId)
    );
    stmts.push(
        db.prepare(`INSERT OR IGNORE INTO shop_rounds (round_date, finalized_at) VALUES (?, ?)`).bind(round, new Date().toISOString())
    );
    await db.batch(stmts);
}

/** 讀取某場次（可選限定某團體）的完整訂單列，供排序/顯示使用。 */
export async function fetchRoundItems(db: any, round: string, groupId?: number | null): Promise<RoundOrderRow[]> {
    const { results } = await db
        .prepare(
            `SELECT o.user_key, u.name, o.card_id, o.qty, o.price, o.color, o.is_black, o.group_id, o.title, o.member_name, o.image,
                    o.submitted_at, o.status
             FROM shop_order_items o JOIN shop_users u ON u.user_key = o.user_key
             WHERE o.round_date = ?${groupId != null ? ' AND o.group_id = ?' : ''}`
        )
        .bind(...(groupId != null ? [round, groupId] : [round]))
        .all();
    return (results || []).map((r: any) => ({
        userKey: String(r.user_key), name: String(r.name), cardId: Number(r.card_id), qty: Number(r.qty) || 1,
        price: Number(r.price), color: String(r.color), isBlack: Number(r.is_black) === 1,
        groupId: r.group_id == null ? null : Number(r.group_id), title: String(r.title), memberName: String(r.member_name),
        image: String(r.image), submittedAt: String(r.submitted_at), status: String(r.status),
    }));
}

export { MAX_NAME_LENGTH };
