import { NextResponse } from 'next/server';

export const runtime = 'edge';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const api_id = searchParams.get('api_id');
  const cursor = searchParams.get('cursor');

  if (!api_id) {
    return NextResponse.json({ error: 'Missing api_id' }, { status: 400 });
  }

  try {
    // 🌟 呼叫實際的外部 API (透過伺服器發送，可避開前端 CORS 問題)
    // const targetUrl = `外部API網址?series_id=${api_id}${cursor ? `&cursor=${cursor}` : ''}`;
    
    /*
    const res = await fetch(targetUrl);
    if (!res.ok) throw new Error('爬蟲請求外部 API 失敗');
    const data = await res.json();
    return NextResponse.json(data);
    */

    // 這裡先回傳假資料，請將上方註解打開並換成真實的 API 網址
    return NextResponse.json({
      records: [], 
      next: null   
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}