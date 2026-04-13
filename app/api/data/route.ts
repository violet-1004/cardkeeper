import { NextResponse } from 'next/server';

export const runtime = 'edge';

export async function GET(request: Request) {
    // 此 API 已廢棄，現已全面改為前端原生 Supabase Client 連線。
    return NextResponse.json({ message: "API Deprecated." });
}

export async function POST(request: Request) {
    // 此 API 已廢棄，現已全面改為前端原生 Supabase Client 連線。
    return NextResponse.json({ error: null, data: null });
}