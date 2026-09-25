// 後台防護（可選）：在 Cloudflare Pages 設定環境變數 ADMIN_PASSWORD 後才會啟用。
// 啟用後，除了公開選購網站（/shop、/api/shop）與登入頁外，所有頁面和 API 都需要登入 cookie。
// 沒設定 ADMIN_PASSWORD 時維持原本行為（不擋），避免部署後把管理者鎖在外面。
export const ADMIN_COOKIE = 'admin_session';
export const SESSION_SECONDS = 30 * 24 * 60 * 60;

const enc = new TextEncoder();
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

async function hmac(password: string, message: string) {
    const key = await crypto.subtle.importKey('raw', enc.encode(password), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return hex(await crypto.subtle.sign('HMAC', key, enc.encode(message)));
}

export function safeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}

export async function makeSessionValue(password: string, nowMs = Date.now()): Promise<string> {
    const exp = Math.floor(nowMs / 1000) + SESSION_SECONDS;
    return `${exp}.${await hmac(password, `admin:${exp}`)}`;
}

export async function verifySessionValue(password: string, value: string | undefined, nowMs = Date.now()): Promise<boolean> {
    if (!value) return false;
    const [expStr, sig] = value.split('.');
    const exp = Number(expStr);
    if (!Number.isFinite(exp) || !sig || exp < Math.floor(nowMs / 1000)) return false;
    return safeEqual(sig, await hmac(password, `admin:${exp}`));
}

export async function passwordMatches(input: string, password: string): Promise<boolean> {
    // 先雜湊再比對，避免長度/內容造成的時間差
    const a = hex(await crypto.subtle.digest('SHA-256', enc.encode(input)));
    const b = hex(await crypto.subtle.digest('SHA-256', enc.encode(password)));
    return safeEqual(a, b);
}
