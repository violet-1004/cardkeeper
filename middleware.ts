import { NextResponse, type NextRequest } from 'next/server';
import { ADMIN_COOKIE, verifySessionValue } from '@/lib/adminAuth';

// 公開：選購網站與登入頁。其餘（後台頁面、/api/data、上傳、爬蟲…）在設定 ADMIN_PASSWORD 後需登入。
const PUBLIC_PREFIXES = ['/shop', '/api/shop', '/admin-login', '/api/admin-login'];

export async function middleware(req: NextRequest) {
    const password = process.env.ADMIN_PASSWORD;
    if (!password) return NextResponse.next(); // 未啟用防護

    const { pathname, search } = req.nextUrl;
    if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))) return NextResponse.next();

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
