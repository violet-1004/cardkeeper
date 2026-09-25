// 對外選購網站（/shop）的共用邏輯：結單時間、順位分配、輸入驗證。
// 純函式、不碰資料庫，方便單獨測試。

// 結單時間：每日 23:00（台灣時間 UTC+8，無日光節約）
export const CUTOFF_HOUR = 23;
const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export const MAX_CART_ITEMS = 100;
export const MAX_NAME_LENGTH = 40;

const pad = (n: number) => String(n).padStart(2, '0');

function fmtUtcDate(ms: number): string {
    const d = new Date(ms);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** 目前「開放中」的場次日期（=下一次 23:00 結單的那一天）。23:00 之後的下單算隔天場次。 */
export function openRoundDate(nowMs: number): string {
    const t = nowMs + TAIPEI_OFFSET_MS; // 把「台灣牆上時間」放進 UTC 欄位運算
    const d = new Date(t);
    const dayStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    return fmtUtcDate(d.getUTCHours() >= CUTOFF_HOUR ? dayStart + DAY_MS : dayStart);
}

export function previousRoundDate(round: string): string {
    return fmtUtcDate(parseRound(round) - DAY_MS);
}

function parseRound(round: string): number {
    const [y, m, d] = round.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
}

/** 該場次結單的絕對時間（epoch ms）。 */
export function cutoffMs(round: string): number {
    return parseRound(round) + CUTOFF_HOUR * 60 * 60 * 1000 - TAIPEI_OFFSET_MS;
}

export function isRoundClosed(round: string, nowMs: number): boolean {
    return nowMs >= cutoffMs(round);
}

export const ROUND_RE = /^\d{4}-\d{2}-\d{2}$/;

// ---- 顏色：黑字金額 = 價格標籤為黑色的小卡金額總和 ----
// 與後台 normalizeSaleColor 相同：非紅/深紫/淺紫（含舊的橘、綠、黑、空值）一律視為黑色
const NON_BLACK = new Set([
    'bg-[#E87A90]', 'bg-[#986DB2]', 'bg-[#81C7D4]',
    'bg-red-500/80', 'bg-purple-500/80', 'bg-blue-500/80',
]);
export function isBlackColor(color: string | null | undefined): boolean {
    return !color || !NON_BLACK.has(color);
}

// ---- 名稱驗證 ----
export function normalizeName(raw: unknown): string | null {
    if (typeof raw !== 'string') return null;
    // 移除控制字元／零寬字元，合併空白，避免用看不見的字元冒名或撐爆版面
    const cleaned = Array.from(raw.normalize('NFKC'))
        .filter((ch) => {
            const c = ch.codePointAt(0)!;
            const control = c <= 0x1f || (c >= 0x7f && c <= 0x9f);
            const invisible = (c >= 0x200b && c <= 0x200f) || (c >= 0x2028 && c <= 0x202f) || (c >= 0x2060 && c <= 0x206f) || c === 0xfeff;
            return !control && !invisible;
        })
        .join('')
        .replace(/\s+/g, ' ')
        .trim();
    if (cleaned.length < 1 || cleaned.length > MAX_NAME_LENGTH) return null;
    return cleaned;
}
export const nameKey = (name: string) => name.toLowerCase();

// ---- 結單後的順位分配 ----
export interface OrderItem {
    userKey: string;
    cardId: number;
    price: number;
    isBlack: boolean;
    submittedAt: string; // ISO，僅用於同分時的穩定排序
}

export interface UserTotals {
    userKey: string;
    total: number;
    black: number;
    firstSubmittedAt: string;
}

/** 順位：黑字金額高到低；相同再依總金額高到低；仍相同則先送單者優先，最後用名稱確保結果固定。 */
export function rankUsers(items: OrderItem[]): UserTotals[] {
    const map = new Map<string, UserTotals>();
    for (const it of items) {
        let u = map.get(it.userKey);
        if (!u) {
            u = { userKey: it.userKey, total: 0, black: 0, firstSubmittedAt: it.submittedAt };
            map.set(it.userKey, u);
        }
        u.total += it.price;
        if (it.isBlack) u.black += it.price;
        if (it.submittedAt < u.firstSubmittedAt) u.firstSubmittedAt = it.submittedAt;
    }
    return [...map.values()].sort(
        (a, b) =>
            b.black - a.black ||
            b.total - a.total ||
            (a.firstSubmittedAt < b.firstSubmittedAt ? -1 : a.firstSubmittedAt > b.firstSubmittedAt ? 1 : 0) ||
            (a.userKey < b.userKey ? -1 : a.userKey > b.userKey ? 1 : 0)
    );
}

/** 依順位把庫存先給順位前面的人；庫存不夠的後面順位標為 sold_out（打叉）。回傳 key = `${userKey}|${cardId}`。 */
export function allocate(
    items: OrderItem[],
    stock: Map<number, number>
): { ranking: UserTotals[]; status: Map<string, 'won' | 'sold_out'> } {
    const ranking = rankUsers(items);
    const remaining = new Map(stock);
    const byUser = new Map<string, OrderItem[]>();
    for (const it of items) {
        const list = byUser.get(it.userKey);
        if (list) list.push(it);
        else byUser.set(it.userKey, [it]);
    }
    const status = new Map<string, 'won' | 'sold_out'>();
    for (const u of ranking) {
        for (const it of byUser.get(u.userKey) || []) {
            const left = remaining.get(it.cardId) ?? 0;
            if (left > 0) {
                remaining.set(it.cardId, left - 1);
                status.set(`${it.userKey}|${it.cardId}`, 'won');
            } else {
                status.set(`${it.userKey}|${it.cardId}`, 'sold_out');
            }
        }
    }
    return { ranking, status };
}

/** 前端顯示用：把價格標籤顏色轉成四種標準色的 class（舊資料自動轉換）。 */
export function priceTagClass(color: string | null | undefined): string {
    if (color === 'bg-[#E87A90]' || color === 'bg-red-500/80') return 'bg-[#E87A90]';
    if (color === 'bg-[#986DB2]' || color === 'bg-purple-500/80') return 'bg-[#986DB2]';
    if (color === 'bg-[#81C7D4]' || color === 'bg-blue-500/80') return 'bg-[#81C7D4]';
    return 'bg-black/70';
}
