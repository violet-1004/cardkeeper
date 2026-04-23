import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';

export const runtime = 'edge';

export async function POST(request: Request) {
  try {
    const { image } = await request.json() as { image: string };
    if (!image) {
      return NextResponse.json({ error: '沒有提供圖片資料' }, { status: 400 });
    }

    const env = getRequestContext().env as any;
    if (!env.BUCKET) {
      throw new Error("環境變數 BUCKET (R2) 尚未綁定");
    }

    // 1. 將 Base64 字串轉換為二進位 (ArrayBuffer)
    const base64Data = image.split(',')[1]; // 去除 'data:image/jpeg;base64,' 前綴
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }

    // 2. 將圖片存進 R2
    const fileName = `uploads/img_${Date.now()}_${Math.floor(Math.random() * 1000)}.jpg`;
    await env.BUCKET.put(fileName, bytes.buffer, {
      httpMetadata: { contentType: 'image/jpeg' }
    });

    // 3. 回傳 R2 的公開網址
    const publicDomain = env.R2_PUBLIC_DOMAIN || "https://pub-您的真實網址.r2.dev";
    return NextResponse.json({ url: `${publicDomain}/${fileName}` });
  } catch (error: any) {
    console.error("[R2 Upload API Error]:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}