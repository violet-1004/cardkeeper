import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '@/schema'; // 確保這裡指向您正確的 schema 檔案路徑

// 🌟 強制邊緣運算，Cloudflare 才會把它編譯成 API
export const runtime = 'edge';

export async function GET(
    request: Request,
    { params }: { params: { table: string } }
) {
    try {
        // 1. 取得前端要求讀取的資料表名稱 (例如: groups, ui_cards)
        const tableName = params.table;
        
        // 2. 轉換命名規則 (如果前端傳 snake_case，但 schema 是 camelCase)
        // 例如: ui_cards -> uiCards
        const schemaKey = tableName.replace(/_([a-z])/g, (g) => g[1].toUpperCase());

        // 3. 檢查 schema 中有沒有這張表
        const targetTable = (schema as any)[schemaKey] || (schema as any)[tableName];
        
        if (!targetTable) {
             return NextResponse.json(
                 { error: `找不到資料表: ${tableName} (對應 Schema: ${schemaKey})` }, 
                 { status: 404 }
             );
        }

        // 4. 連線 D1 並撈出所有資料
        // 修改後的寫法
        const env = getRequestContext().env as any;
        const db = drizzle(env.DB);
        const data = await db.select().from(targetTable);

        // 5. 回傳資料
        return NextResponse.json(data);

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}