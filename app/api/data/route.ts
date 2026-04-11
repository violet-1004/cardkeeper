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
             // 🌟 針對尚未建立的 ui_settings，直接回傳空資料讓前端靜默通過
             if (tableName === 'ui_settings') {
                 return NextResponse.json({ data: [] });
             }
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

        // 5. 🌟 核心修復：將資料包在 data 屬性裡面，符合前端 result.data 的預期
        return NextResponse.json({ data });

    } catch (error: any) {
        console.error("API 錯誤:", error);
        return NextResponse.json({ 
            error: error.message || String(error),
            stack: error.stack 
        }, { status: 400 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { action, table, data, filters } = body;

        const schemaMap: Record<string, any> = {
            'groups': schema.groups, 'members': schema.members, 'series': schema.series,
            'batches': schema.batches, 'channels': schema.channels, 'types': schema.types,
            'ui_cards': schema.uiCards, 'ui_inventory': schema.uiInventory, 'bulk_records': schema.bulkRecords,
            'custom_lists': schema.customLists, 'ui_sales': schema.uiSales, 'ui_settings': (schema as any).uiSettings,
            'ui_subunits': schema.uiSubunits,
        };

        const targetTable = schemaMap[table];
        if (!targetTable) return NextResponse.json({ error: null, data: null });

        let env;
        try { env = getRequestContext().env as any; } catch(e) { return NextResponse.json({ error: { message: "無 Edge 環境" } }); }
        if (!env || !env.DB) return NextResponse.json({ error: { message: "未綁定 DB" } });

        const db = drizzle(env.DB);
        const { eq, and, inArray, sql } = await import('drizzle-orm');

        let whereClause = undefined;
        if (filters && filters.length > 0) {
            const conditions = filters.map((f: any) => {
                const camelCol = f.col.replace(/_([a-z])/g, (g: string) => g[1].toUpperCase());
                const dbCol = targetTable[camelCol];
                if (!dbCol) return null;
                if (f.op === 'eq') return eq(dbCol, f.val);
                if (f.op === 'in') return inArray(dbCol, f.vals);
                return null;
            }).filter(Boolean);
            if (conditions.length > 0) whereClause = conditions.length === 1 ? conditions[0] : and(...conditions);
        }

        if (action === 'insert' || action === 'upsert') {
            const items = Array.isArray(data) ? data : [data];
            if (items.length > 0) {
                if (action === 'upsert') {
                    const firstItem = items[0];
                    const setObj: Record<string, any> = {};
                    for (const key of Object.keys(firstItem)) {
                        if (key !== 'id' && targetTable[key]) {
                            setObj[key] = sql.raw(`excluded."${targetTable[key].name}"`);
                        }
                    }
                    const pk = targetTable.id || targetTable.key;
                    if (pk) {
                        await db.insert(targetTable).values(items).onConflictDoUpdate({ target: pk, set: setObj });
                    } else {
                        await db.insert(targetTable).values(items);
                    }
                } else {
                    await db.insert(targetTable).values(items);
                }
            }
        } else if (action === 'update' && whereClause) {
            await db.update(targetTable).set(data).where(whereClause);
        } else if (action === 'delete' && whereClause) {
            await db.delete(targetTable).where(whereClause);
        }

        return NextResponse.json({ error: null, data: null });
    } catch (error: any) {
        console.error('DB POST 錯誤:', error);
        return NextResponse.json({ error: { message: error.message || String(error) } });
    }
}