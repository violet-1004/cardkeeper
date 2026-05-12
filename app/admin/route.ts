import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';

export const runtime = 'edge';

export async function POST(request: Request) {
  try {
    const env = getRequestContext().env as any;
    if (!env.BUCKET) throw new Error("R2 尚未綁定");

    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: '找不到檔案' }, { status: 400 });
    }

    const r2PublicUrl = "https://pub-f5a70c4f84d841ada9cbda4eafbb30ee.r2.dev";
    const fileName = `uploads/${Date.now()}_${file.name}`;

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