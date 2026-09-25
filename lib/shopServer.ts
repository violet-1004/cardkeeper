// 對外選購網站的伺服器端工具。
// 安全原則：
//  - 只讀取「販售中」小卡的展示欄位（不含成本、庫存、備註、買家等原始資料）
//  - 只寫入 shop_ 開頭的獨立資料表，絕不寫入既有資料表
//  - 所有 SQL 都用 bind 參數，不拼接使用者輸入
import { getRequestContext } from '@cloudflare/next-on-pages';
import { NextResponse } from 'next/server';
import { nameKey, normalizeName, MAX_NAME_LENGTH } from './shop';

export function getDb(): any {
    const env = getRequestContext().env as any;
    if (!env?.DB) throw new Error('DB binding missing');
    return env.DB;
}

let schemaReady: Promise<void> | null = null;
export function ensureShopSchema(db: any): Promise<void> {
    if (!schemaReady) {
        schemaReady = db
            .batch([
                db.prepare(`CREATE TABLE IF NOT EXISTS shop_users (
                    user_key TEXT PRIMARY KEY, name TEXT NOT NULL, token_hash TEXT NOT NULL, created_at TEXT NOT NULL)`),
                db.prepare(`CREATE TABLE IF NOT EXISTS shop_carts (
                    user_key TEXT NOT NULL, card_id INTEGER NOT NULL, added_at TEXT NOT NULL,
                    PRIMARY KEY (user_key, card_id))`),
                db.prepare(`CREATE TABLE IF NOT EXISTS shop_order_items (
                    round_date TEXT NOT NULL, user_key TEXT NOT NULL, card_id INTEGER NOT NULL,
                    price INTEGER NOT NULL, color TEXT NOT NULL, is_black INTEGER NOT NULL,
                    title TEXT NOT NULL, member_name TEXT NOT NULL, image TEXT NOT NULL,
                    submitted_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
                    PRIMARY KEY (round_date, user_key, card_id))`),
                db.prepare(`CREATE TABLE IF NOT EXISTS shop_rounds (
                    round_date TEXT PRIMARY KEY, finalized_at TEXT NOT NULL)`),
                db.prepare(`CREATE TABLE IF NOT EXISTS shop_rate (
                    k TEXT PRIMARY KEY, n INTEGER NOT NULL, exp INTEGER NOT NULL)`),
            ])
            .then(() => undefined)
            .catch((e: unknown) => {
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

// ---------- 販售中小卡（只讀、只取展示欄位） ----------
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

    const memberMap = new Map<number, any>((members.results || []).map((m: any) => [Number(m.id), m]));
    const seriesMap = new Map<number, any>((series.results || []).map((s: any) => [Number(s.id), s]));
    const batchMap = new Map<number, any>((batches.results || []).map((b: any) => [Number(b.id), b]));
    const byIdOrName = (rows: any[]) => {
        const m = new Map<string, any>();
        for (const r of rows) {
            m.set(String(r.id), r);
            if (r.name != null) m.set(String(r.name), r);
        }
        return m;
    };
    const channelMap = byIdOrName(channels.results || []);
    const typeMap = byIdOrName(types.results || []);

    const cards: ShopCard[] = (salesRes.results || []).map((r: any) => {
        let subIds: number[] = [];
        try {
            const parsed = typeof r.member_id2 === 'string' ? JSON.parse(r.member_id2) : r.member_id2;
            if (Array.isArray(parsed)) subIds = parsed.map(Number).filter((n) => Number.isInteger(n));
        } catch {
            /* member_id2 格式不合就忽略 */
        }
        const main = memberMap.get(Number(r.member_id));
        const names = [main?.name, ...subIds.map((id) => memberMap.get(id)?.name)].filter(Boolean);
        const ser = seriesMap.get(Number(r.series_id));
        const bat = batchMap.get(Number(r.batch_id));
        const typeObj = nullish(r.type) ? null : typeMap.get(String(r.type));
        const chObj = nullish(r.channel) ? null : channelMap.get(String(r.channel));
        const typeName = nullish(r.type) ? null : String(typeObj ? typeObj.short_name || typeObj.name : r.type);
        const channelName = nullish(r.channel) ? null : String(chObj ? chObj.short_name || chObj.name : r.channel);
        const batchNumber = bat && !nullish(bat.batch_number) ? String(bat.batch_number) : null;
        const title = [ser ? ser.short_name || ser.name : null, [channelName, batchNumber].filter(Boolean).join(''), typeName]
            .filter(Boolean)
            .join(' ');
        return {
            id: Number(r.card_id),
            image: clip(r.image, 500),
            title: clip(title || '未命名卡片', 120),
            memberName: clip(names.join('\\'), 120),
            groupId: r.group_id == null ? null : Number(r.group_id),
            memberIds: [Number(r.member_id), ...subIds].filter((n) => Number.isInteger(n)),
            seriesId: r.series_id == null ? null : Number(r.series_id),
            subunit: main?.subunit || ser?.subunit || null,
            typeName,
            channelName,
            price: Number(r.price),
            color: clip(r.color, 40) || 'bg-black/70',
            quantity: Number(r.quantity),
        };
    });

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

export { MAX_NAME_LENGTH };
