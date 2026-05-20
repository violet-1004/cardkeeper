import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { drizzle } from 'drizzle-orm/d1';
import { uiCards } from '@/schema'; 
import { eq } from 'drizzle-orm';

export const runtime = 'edge';

export async function POST(request) {
  try {
    const env = getRequestContext().env;
    const db = drizzle(env.DB);
    
    const body = await request.json();
    const { local_card_id, poca_id } = body;

    if (!local_card_id || !poca_id) {
      return NextResponse.json({ error: '參數遺失' }, { status: 400 });
    }

    // 更新 Cloudflare D1 資料庫
    await db.update(uiCards)
      .set({ poco_id: Number(poca_id) })
      .where(eq(uiCards.id, Number(local_card_id)));

    return NextResponse.json({ success: true });
    
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}