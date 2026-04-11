import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { drizzle } from 'drizzle-orm/d1';
import { asc, desc, eq } from 'drizzle-orm';
import * as schema from '@/schema';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    
    // 🌟 從前端傳來的 query 參數動態讀取要撈取的資料表名稱
    const table = searchParams.get('table');
    if (!table) {
      return NextResponse.json({ error: 'Missing table parameter' }, { status: 400 });
    }

    const orderBy = searchParams.get('orderBy');
    const ascending = searchParams.get('ascending') !== 'false';
    const limit = searchParams.get('limit');
    const filterColumn = searchParams.get('filterColumn');
    const filterValue = searchParams.get('filterValue');

    // 將前端傳入的底線命名(e.g., ui_cards) 轉成 Schema 中定義的駝峰物件(e.g., uiCards)
    const camelCaseTable = table.replace(/_([a-z])/g, g => g[1].toUpperCase());
    const tableSchema = (schema as any)[camelCaseTable];

    if (!tableSchema) {
      return NextResponse.json({ error: `找不到對應的資料表 Schema: ${table}` }, { status: 400 });
    }

    const env = getRequestContext().env as any;
    const db = drizzle(env.DB);

    let query = db.select().from(tableSchema);

    const camelCaseFilterColumn = filterColumn ? filterColumn.replace(/_([a-z])/g, g => g[1].toUpperCase()) : null;
    const camelCaseOrderBy = orderBy ? orderBy.replace(/_([a-z])/g, g => g[1].toUpperCase()) : null;

    if (camelCaseFilterColumn && filterValue && tableSchema[camelCaseFilterColumn]) {
      query = query.where(eq(tableSchema[camelCaseFilterColumn], filterValue)) as any;
    }

    if (camelCaseOrderBy && tableSchema[camelCaseOrderBy]) {
      if (ascending) {
        query = query.orderBy(asc(tableSchema[camelCaseOrderBy])) as any;
      } else {
        query = query.orderBy(desc(tableSchema[camelCaseOrderBy])) as any;
      }
    }

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