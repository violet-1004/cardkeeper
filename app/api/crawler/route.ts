import { NextResponse } from 'next/server';

export const runtime = 'edge';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const planets = searchParams.get('planets'); // ex: cravity

  try {
    // 🌟 實作你在主頁 (app/page.tsx) 呼叫 /api/crawler?planets=... 的邏輯
    
    return NextResponse.json({
      success: true,
      message: '資料同步完成'
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
