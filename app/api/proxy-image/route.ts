export const runtime = 'edge';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get('url');

  if (!targetUrl) {
    return new Response('缺少目標網址', { status: 400 });
  }

  try {
    const res = await fetch(targetUrl);
    
    if (!res.ok) {
      return new Response('獲取外部圖片失敗', { status: res.status });
    }

    const blob = await res.blob();
    const headers = new Headers();
    headers.set('Content-Type', res.headers.get('content-type') || 'image/jpeg');
    // 允許您的前端網域讀取此圖片
    headers.set('Access-Control-Allow-Origin', '*'); 

    return new Response(blob, {
      status: 200,
      headers: headers,
    });
  } catch (error) {
    return new Response('代理請求發生錯誤', { status: 500 });
  }
}