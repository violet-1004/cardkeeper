import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';

export const runtime = 'edge';

export async function POST(request: Request) {
  try {
    const env = getRequestContext().env as any;
    if (!env.BUCKET) throw new Error("R2 尚未綁定");

    const formData = await request.formData();
    const file = formData.get('file') as File;

    // 確保 file 存在且真的是一個檔案物件 (File)
    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: '找不到有效的檔案' }, { status: 400 });
    }

    // 1. 產生唯一檔名，避免重複
    const fileExt = file.name.split('.').pop();
    const fileName = `card_${Date.now()}.${fileExt}`;
    const r2PublicUrl = "https://pub-f5a70c4f84d841ada9cbda4eafbb30ee.r2.dev";

    // 2. 轉換檔案並上傳至 R2
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