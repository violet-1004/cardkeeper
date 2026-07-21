'use server';

interface PocaCardPayload {
  id: number;
  image: string;
  stocked_count: number;
  price: number;
}

import { createClient } from './server'; // 🌟 修正：改為從同層級的 server.ts 檔案中建立 Client
import { toSnakeCase } from '@/lib/utils';

export async function fetchSeriesAndGroups() {
  const supabase = createClient();
  try {
    const { data: seriesData, error: seriesError } = await supabase.from('series').select('*');
    if (seriesError) throw seriesError;

    const { data: groupsData, error: groupsError } = await supabase.from('groups').select('*');
    if (groupsError) throw groupsError;

    return { seriesData, groupsData, error: null };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    console.error('Error fetching series and groups:', errorMessage);
    return { seriesData: [], groupsData: [], error: errorMessage };
  }
}

export async function upsertPocaCards(records: PocaCardPayload[]) {
  const supabase = createClient();
  const snakeCaseRecords = records.map(toSnakeCase);
  const { count, error } = await supabase.from('poca').upsert(snakeCaseRecords);

  if (error) return { success: false, error: error.message, count: 0 }; // 🌟 確保錯誤時 count 為 0
  return { success: true, error: null, count: count ?? 0 }; // 🌟 修正：使用 ?? 確保 count 為 null 時回傳 0
}