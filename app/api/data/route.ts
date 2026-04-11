import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '@/schema';

// 🌟 強制邊緣運算，Cloudflare 才會把它編譯成 API
export const runtime = 'edge';
export const dynamic = 'force-dynamic';

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
        let env;
        try {
            env = getRequestContext().env as any;
        } catch (e) {
            return NextResponse.json({ error: "無法取得 Cloudflare 邊緣運算環境。如果您在本地端開發，請使用 wrangler pages dev 來啟動伺服器。" }, { status: 400 });
        }
        
        if (!env || !env.DB) {
            return NextResponse.json({ error: "找不到 D1 資料庫綁定 'DB'。請確認您已在 Cloudflare Pages 後台設定了綁定。" }, { status: 400 });
        }
        const db = drizzle(env.DB);
        const data = await db.select().from(targetTable);

        // 5. 回傳資料
        return NextResponse.json(data);

    } catch (error: any) {
        console.error("API 錯誤:", error);
        return NextResponse.json({ error: error.message || String(error) }, { status: 400 });
    }
}