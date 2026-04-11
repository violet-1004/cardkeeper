import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '@/schema';

// 🌟 強制邊緣運算，Cloudflare 才會把它編譯成 API
export const runtime = 'edge';

export async function GET(request: Request) {
    try {
        // 1. 從網址列取得 ?table=xxx 的參數
        const { searchParams } = new URL(request.url);
        const tableName = searchParams.get('table');

        if (!tableName) {
            return NextResponse.json({ error: "缺少 table 參數" }, { status: 400 });
        }

        // 2. 轉換命名規則 (例如前端傳 ui_cards，轉成 schema 裡的 uiCards)
        const schemaKey = tableName.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
        
        // 3. 確認 Schema 中有沒有這張表
        const targetTable = (schema as any)[schemaKey] || (schema as any)[tableName];
        if (!targetTable) {
             return NextResponse.json(
                 { error: `找不到資料表對應的 Schema: ${tableName}` }, 
                 { status: 404 }
             );
        }

        // 4. 連線 D1 並撈出資料 (使用繞過型別檢查的寫法)
        const env = getRequestContext().env as any;
        const db = drizzle(env.DB);
        const data = await db.select().from(targetTable);

        // 5. 回傳資料
        return NextResponse.json(data);

    } catch (error: any) {
        console.error("API 錯誤:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}