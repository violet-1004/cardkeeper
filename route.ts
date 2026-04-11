import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { drizzle } from 'drizzle-orm/d1';
import { asc, desc, eq } from 'drizzle-orm';
import * as schema from '@/schema'; // 引入您寫好的 Drizzle schema

// 🌟 關鍵 1：告訴 Next.js 這支 API 跑在 Edge 環境
export const runtime = 'edge';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const table = searchParams.get('table');
    const orderBy = searchParams.get('orderBy');
    const ascending = searchParams.get('ascending') !== 'false';
    const limit = searchParams.get('limit');
    const filterColumn = searchParams.get('filterColumn');
    const filterValue = searchParams.get('filterValue');

    if (!table) {
      return NextResponse.json({ error: 'Missing table parameter' }, { status: 400 });
    }

    // 🌟 將 Supabase 的底線命名 (e.g. ui_cards) 自動轉成 Drizzle schema 的駝峰物件 (e.g. uiCards)
    const camelCaseTable = table.replace(/_([a-z])/g, g => g[1].toUpperCase());
    const tableSchema = (schema as any)[camelCaseTable];

    if (!tableSchema) {
      return NextResponse.json({ error: `找不到對應的資料表 Schema: ${table}` }, { status: 400 });
    }

    // 🌟 關鍵 2：取得 Cloudflare 綁定的 D1 資料庫 (env.DB)
    const env = getRequestContext().env as any;
    const db = drizzle(env.DB);

    // 🌟 關鍵 3：透過 Drizzle 撈取資料
    let query = db.select().from(tableSchema);

    // 🌟 將傳入的底線欄位名稱轉為駝峰，以符合 Drizzle Schema 定義
    const camelCaseFilterColumn = filterColumn ? filterColumn.replace(/_([a-z])/g, g => g[1].toUpperCase()) : null;
    const camelCaseOrderBy = orderBy ? orderBy.replace(/_([a-z])/g, g => g[1].toUpperCase()) : null;

    // 處理 where 過濾 (支援簡單的相等過濾)
    if (camelCaseFilterColumn && filterValue && tableSchema[camelCaseFilterColumn]) {
      query = query.where(eq(tableSchema[camelCaseFilterColumn], filterValue)) as any;
    }

    // 處理排序
    if (camelCaseOrderBy && tableSchema[camelCaseOrderBy]) {
      if (ascending) {
        query = query.orderBy(asc(tableSchema[camelCaseOrderBy])) as any;
      } else {
        query = query.orderBy(desc(tableSchema[camelCaseOrderBy])) as any;
      }
    }

    // 處理限制筆數
    if (limit) {
      query = query.limit(Number(limit)) as any;
    }

    const data = await query.all();
    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error('API 讀取錯誤:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}