import { NextResponse, type NextRequest } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { ADMIN_COOKIE, verifySessionValue } from '@/lib/adminAuth';

// 讀取環境變數：process.env 在 next-on-pages 的 Edge Middleware 裡不一定會拿到 Cloudflare
// 綁定的值，所以要再用 getRequestContext().env 補一次。
function getEnv(name: string): string | undefined {
    if (process.env[name]) return process.env[name];
    try {
        return (getRequestContext().env as any)?.[name];
    } catch {
        return undefined;
    }
}

// 這份 middleware 同時服務兩種部署：
//  - cardkeeper 本站（後台管理）：預設不需要密碼；只有設定 ADMIN_PASSWORD 才會要求登入。
//  - 對外選購網站（不同網域的另一個 Cloudflare Pages 專案，共用同一份程式碼與 D1）：
//    設定 SHOP_ONLY=1 後，這個網域只會顯示 /shop、/api/shop，其餘一律 404，
//    確保就算有人知道後台網址，也無法從選購網域碰到後台頁面或 /api/data 等原始資料端點。
const SHOP_ONLY_PREFIXES = ['/shop', '/api/shop'];
const ADMIN_PUBLIC_PREFIXES = ['/shop', '/api/shop', '/admin-login', '/api/admin-login'];

const matches = (pathname: string, prefixes: string[]) =>
    prefixes.some((p) => pathname === p || pathname.startsWith(p + '/'));

export async function middleware(req: NextRequest) {
    const { pathname, search } = req.nextUrl;

    if (getEnv('SHOP_ONLY')) {
        if (pathname === '/') {
            const url = req.nextUrl.clone();
            url.pathname = '/shop';
            return NextResponse.redirect(url);
        }
        if (!matches(pathname, SHOP_ONLY_PREFIXES)) {
            return new NextResponse('Not Found', { status: 404 });
        }
        return NextResponse.next();
    }

    const password = getEnv('ADMIN_PASSWORD');
    if (!password) return NextResponse.next(); // 未啟用防護（cardkeeper 預設狀態）

    if (matches(pathname, ADMIN_PUBLIC_PREFIXES)) return NextResponse.next();
    if (await verifySessionValue(password, req.cookies.get(ADMIN_COOKIE)?.value)) return NextResponse.next();

    if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
    }
    const url = req.nextUrl.clone();
    url.pathname = '/admin-login';
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
}

export const config = {
    // 靜態資源不經過（不含資料）；其他路徑全部檢查
    matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
