import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { drizzle } from 'drizzle-orm/d1';
import { uiCards, poca } from '@/schema'; 
import { eq } from 'drizzle-orm';

export const runtime = 'edge';

export async function POST(request) {
  try {
    const env = getRequestContext().env;
    const db = drizzle(env.DB);
    
    const body = await request.json();
    const { local_card_id, poca_id, overwrite_image, poca_image } = body;

    if (!local_card_id || !poca_id) {
      return NextResponse.json({ error: '參數遺失' }, { status: 400 });
    }

    // 建立 ui_cards 的更新內容
    const uiCardUpdate = { poco_id: Number(poca_id) };
    if (overwrite_image && poca_image) {
      uiCardUpdate.image = poca_image;
    }

    // 🌟 使用 db.batch 進行雙向同步更新
    await db.batch([
      // 動作一：將 POCA ID 寫入本地 ui_cards 表
      db.update(uiCards)
        .set(uiCardUpdate)
        .where(eq(uiCards.id, Number(local_card_id))),
        
      // 動作二：將本地卡片 ID 寫入 poca 表的 card_id 欄位
      db.update(poca)
        .set({ card_id: Number(local_card_id) })
        .where(eq(poca.id, Number(poca_id)))
    ]);

    return NextResponse.json({ success: true });
    
  } catch (error) {
    console.error("雙向綁定失敗:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}