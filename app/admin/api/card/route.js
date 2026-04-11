
export const runtime = 'edge';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const cursor = searchParams.get('cursor') || '';
    const apiId = searchParams.get('api_id');

    if (!apiId) {
        return NextResponse.json({ error: 'Missing api_id parameter' }, { status: 400 });
    }

    // 根據是否有 cursor 來決定請求網址
    let targetUrl = `https://koca.shop/api/series/${apiId}/items?type=idol_card`;
    if (cursor && cursor !== 'null') {
        targetUrl += `&cursor=${cursor}`;
    }

    try {
        const res = await fetch(targetUrl, {
            method: 'GET',
            headers: {
                'Accept': '*/*',
                'Accept-Language': 'zh-TW,zh-Hant;q=0.9',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
                'Referer': 'https://koca.shop/',
                'Sec-Fetch-Dest': 'empty',
                'Sec-Fetch-Mode': 'cors',
                'Sec-Fetch-Site': 'same-origin',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.3 Safari/605.1.15',
                'Cookie': '_ga_3CGMMHMNJH=GS2.1.s1773330609$o2$g0$t1773330609$j60$l0$h0; nfd-enable-cf-opt=63a6825d27cab0f204d3b602; _ga=GA1.1.1260260027.1773326335'
            }
        });

        if (!res.ok) {
            const errorText = await res.text();
            throw new Error(`HTTP Error: ${res.status} - ${errorText}`);
        }

        const data = await res.json();
        return NextResponse.json(data);

    } catch (error) {
        console.error("爬蟲伺服器錯誤:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
