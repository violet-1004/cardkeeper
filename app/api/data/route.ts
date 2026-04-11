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

        // 🌟 防爆機制：建立明確的對應字典，避免 Webpack 在正式環境壓縮(Minify)導致動態變數名稱失效
        const schemaMap: Record<string, any> = {
            'groups': schema.groups,
            'members': schema.members,
            'series': schema.series,
            'batches': schema.batches,
            'channels': schema.channels,
            'types': schema.types,
            'ui_cards': schema.uiCards,
            'ui_inventory': schema.uiInventory,
            'bulk_records': schema.bulkRecords,
            'custom_lists': schema.customLists,
            'ui_sales': schema.uiSales,
            'ui_settings': (schema as any).uiSettings, // 🌟 加上 (schema as any) 繞過 TypeScript 檢查
            'ui_subunits': schema.uiSubunits,
        };

        // 3. 從字典中取得對應的資料表
        const targetTable = schemaMap[tableName];
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
        return NextResponse.json({ 
            error: error.message || String(error),
            stack: error.stack 
        }, { status: 400 });
    }
}