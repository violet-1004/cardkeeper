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
    const { local_card_id, poca_id, overwrite_image, poca_image } = body;

    if (!local_card_id || !poca_id) {
      return NextResponse.json({ error: '參數遺失' }, { status: 400 });
    }

    // 建立基礎更新物件
    const updateData = { poco_id: Number(poca_id) };

    // 若前端指示覆蓋，且有提供圖片網址，則將 image 欄位加入更新排程
    if (overwrite_image && poca_image) {
      updateData.image = poca_image;
    }

    const result = await db.update(uiCards)
      .set(updateData)
      .where(eq(uiCards.id, Number(local_card_id)))
      .returning(); 

    if (result.length === 0) {
      return NextResponse.json({ error: `資料庫找不到 ID 為 ${local_card_id} 的本地卡片` }, { status: 404 });
    }

    return NextResponse.json({ success: true, updatedCard: result[0] });
    
  } catch (error) {
    console.error("API 發生錯誤:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}