import { D1Database, D1Result } from '@cloudflare/workers-types';

/**
 * 建立一個模擬 Supabase Client 的 Cloudflare D1 Client。
 * 這讓您可以在 Server Actions 中使用類似 .from().select() 的語法。
 */
export function createClient() {
  // 在 Cloudflare Pages/Workers 環境中，process.env.DB 會自動綁定到您的 D1 資料庫
  const DB = process.env.DB as unknown as D1Database;

  if (!DB) {
    // 在本地開發環境中，process.env.DB 可能不存在。
    // 您可以在這裡拋出錯誤或回傳一個模擬的 client。
    // 為了讓本地開發也能運作，我們回傳一個會印出警告的假 client。
    console.warn(
      '警告：未偵測到 Cloudflare D1 資料庫綁定 (process.env.DB)。' +
      '在本地開發環境中，所有資料庫操作將會失敗。' +
      '請使用 Wrangler 進行本地開發以連接 D1。'
    );
    return createMockClient();
  }

  const from = (table: string) => {
    return {
      /**
       * 模擬 select 操作
       * @param columns - 要查詢的欄位，預設為 '*'
       */
      select: async (columns = '*') => {
        try {
          const stmt = DB.prepare(`SELECT ${columns} FROM ${table}`);
          const { results } = await stmt.all();
          return { data: results, error: null };
        } catch (e: any) {
          console.error(`D1 Select Error on table ${table}:`, e.message);
          return { data: null, error: e };
        }
      },
      /**
       * 模擬 upsert 操作
       * @param records - 要插入或更新的紀錄陣列
       */
      upsert: async (records: Record<string, any>[]) => {
        if (!records || records.length === 0) {
          return { count: 0, error: null };
        }
        try {
          const columns = Object.keys(records[0]);
          const placeholders = columns.map(() => '?').join(', ');
          const updates = columns.map(col => `${col} = excluded.${col}`).join(', ');

          const stmt = DB.prepare(
            `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})
             ON CONFLICT(id) DO UPDATE SET ${updates}`
          );

          const statements = records.map(record => stmt.bind(...columns.map(col => record[col])));
          const results: D1Result<any>[] = await DB.batch(statements);
          
          const errorResult = results.find(r => !r.success);
          if (errorResult) {
            throw new Error(errorResult.error || 'Batch upsert failed');
          }

          return { count: records.length, error: null };
        } catch (e: any) {
          console.error(`D1 Upsert Error on table ${table}:`, e.message);
          return { count: 0, error: e };
        }
      },
    };
  };

  return { from };
}

// 建立一個在本地開發時使用的假 Client，避免程式因找不到 DB 而崩潰
const createMockClient = () => ({
  from: (table: string) => ({
    select: async () => ({ data: [], error: { message: '本地開發環境，未連接 D1' } }),
    upsert: async () => ({ count: 0, error: { message: '本地開發環境，未連接 D1' } }),
  }),
});