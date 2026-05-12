import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';

export const runtime = 'edge';

export async function POST(request: Request) {
  try {
    const env = getRequestContext().env as any;
    if (!env.BUCKET) throw new Error("R2 尚未綁定");

    // 1. 捨棄容易出錯的 request.formData()，直接讀取原始二進位資料
    const arrayBuffer = await request.arrayBuffer();
    if (!arrayBuffer || arrayBuffer.byteLength === 0) {
      return NextResponse.json({ error: '找不到檔案內容' }, { status: 400 });
    }

    // 2. 從網址的 Query 參數中取得前端傳來的檔名與類型
    const url = new URL(request.url);
    const originalName = url.searchParams.get('name') || 'upload.jpg';
    const mimeType = url.searchParams.get('type') || 'image/jpeg';

    // 3. 產生唯一檔名，避免重複
    const fileExt = originalName.split('.').pop() || 'jpg';
    const fileName = `card_${Date.now()}.${fileExt}`;
    const r2PublicUrl = "https://pub-f5a70c4f84d841ada9cbda4eafbb30ee.r2.dev";

    // 4. 直接將 ArrayBuffer 寫入 R2
    await env.BUCKET.put(fileName, arrayBuffer, {
      httpMetadata: { contentType: mimeType },
    });

    const finalUrl = `${r2PublicUrl}/${fileName}`;

    return NextResponse.json({ success: true, url: finalUrl });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}