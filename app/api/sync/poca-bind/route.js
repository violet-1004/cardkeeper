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
    const { ui_card_id, poco_id } = await request.json();

    if (!ui_card_id || !poco_id) {
      return NextResponse.json({ error: '參數遺失' }, { status: 400 });
    }

    await db.update(uiCards)
      .set({ poco_id: Number(poco_id) })
      .where(eq(uiCards.id, Number(ui_card_id)));

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}