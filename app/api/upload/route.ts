import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';

export const runtime = 'edge';

export async function POST(request: Request) {
  try {
    const env = getRequestContext().env as any;
    if (!env.BUCKET) throw new Error("R2 尚未綁定");

    // 1. 正確解析 FormData (前端已移除 Content-Type 標頭，現在可以安全使用了！)
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: '找不到有效的檔案' }, { status: 400 });
    }

    // 2. 產生唯一檔名，避免重複
    const fileExt = file.name.split('.').pop() || 'jpg';
    const fileName = `card_${Date.now()}.${fileExt}`;
    const r2PublicUrl = "https://pub-f5a70c4f84d841ada9cbda4eafbb30ee.r2.dev";

    // 3. 轉換檔案並寫入 R2
    const arrayBuffer = await file.arrayBuffer();
    await env.BUCKET.put(fileName, arrayBuffer, {
      httpMetadata: { contentType: file.type },
    });

    const finalUrl = `${r2PublicUrl}/${fileName}`;

    return NextResponse.json({ success: true, url: finalUrl });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}