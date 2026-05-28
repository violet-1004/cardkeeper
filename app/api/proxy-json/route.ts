import { NextResponse } from 'next/server';

export const runtime = 'edge';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const targetUrl = searchParams.get('url');

    if (!targetUrl) {
        return NextResponse.json({ error: '缺少 url 參數' }, { status: 400 });
    }

    try {
        const response = await fetch(targetUrl, {
            headers: {
                // 🌟 偽裝成一般的瀏覽器，避免被當成機器人擋掉
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'en-US,en;q=0.9,zh-TW;q=0.8,zh;q=0.7',
            }
        });

        if (!response.ok) {
            if (response.status === 404) {
                return NextResponse.json({ error: '上游 API 請求失敗，狀態碼: 404' }, { status: 404 });
            }
            throw new Error(`上游 API 請求失敗，狀態碼: ${response.status}`);
        }

        const data = await response.json();
        return NextResponse.json(data);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
