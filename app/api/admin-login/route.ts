import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { ADMIN_COOKIE, SESSION_SECONDS, makeSessionValue, passwordMatches } from '@/lib/adminAuth';
import { getDb, ensureShopSchema, rateLimit, clientIp, readJson } from '@/lib/shopServer';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

function getPassword(): string | undefined {
    if (process.env.ADMIN_PASSWORD) return process.env.ADMIN_PASSWORD;
    try {
        return (getRequestContext().env as any)?.ADMIN_PASSWORD;
    } catch {
        return undefined;
    }
}

const noStore = { 'Cache-Control': 'no-store' };

export async function POST(req: Request) {
    const password = getPassword();
    if (!password) return NextResponse.json({ error: '尚未啟用後台防護' }, { status: 400, headers: noStore });

    try {
        const db = getDb();
        await ensureShopSchema(db);
        if (!(await rateLimit(db, 'admin-login', clientIp(req), 10, 600))) {
            return NextResponse.json({ error: '嘗試次數過多，請 10 分鐘後再試' }, { status: 429, headers: noStore });
        }
    } catch {
        return NextResponse.json({ error: '伺服器錯誤' }, { status: 500, headers: noStore });
    }

    const body = await readJson(req, 1024);
    if (typeof body?.password !== 'string' || !(await passwordMatches(body.password, password))) {
        return NextResponse.json({ error: '密碼錯誤' }, { status: 401, headers: noStore });
    }
    const res = NextResponse.json({ ok: true }, { headers: noStore });
    res.cookies.set(ADMIN_COOKIE, await makeSessionValue(password), {
        httpOnly: true, secure: true, sameSite: 'strict', path: '/', maxAge: SESSION_SECONDS,
    });
    return res;
}

export async function DELETE() {
    const res = NextResponse.json({ ok: true }, { headers: noStore });
    res.cookies.set(ADMIN_COOKIE, '', { httpOnly: true, secure: true, sameSite: 'strict', path: '/', maxAge: 0 });
    return res;
}
