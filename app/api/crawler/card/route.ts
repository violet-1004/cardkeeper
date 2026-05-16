import { NextResponse } from 'next/server';
export const runtime = 'edge';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const apiId = searchParams.get('api_id');
    const cursor = searchParams.get('cursor');

    if (!apiId) {
        return NextResponse.json({ error: 'Missing api_id' }, { status: 400 });
    }

    // 🌟 完美對應您提供的小卡 (Cards) 專屬 API 格式
    let kocaUrl = `https://koca.shop/api/series/${apiId}/items?type=idol_card`;
    
    if (cursor) {
        kocaUrl += `&cursor=${cursor}`; // 小卡網址已經有 type 參數，所以這裡用 &
    }

    try {
        const response = await fetch(kocaUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' }
        });

        const data = await response.json();
        return NextResponse.json(data);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}