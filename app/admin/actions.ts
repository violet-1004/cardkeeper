'use server';
import { getRequestContext } from '@cloudflare/next-on-pages';

// 負責將外部圖片下載並轉存至您的 R2
export async function uploadImageToR2(externalUrl: string, fileName: string) {
    try {
        // 取得 R2 綁定與設定您的公開網址
        const env = getRequestContext().env as any;
        if (!env.BUCKET) throw new Error("R2 尚未綁定");

        // 🌟 優先讀取環境變數中的 R2 公開網址，若無則使用預設值
        const R2_PUBLIC_URL = env.R2_PUBLIC_URL || "https://pub-f5a70c4f84d841ada9cbda4eafbb30ee.r2.dev"; 

        let arrayBuffer: ArrayBuffer;
        let contentType: string;

        // 1. 判斷圖片網址格式
        if (externalUrl.startsWith('http')) {
            // 抓取外部 HTTP/HTTPS 圖片
            const response = await fetch(externalUrl);
            // 🌟 修正：如果圖片抓取失敗 (例如 404)，直接回傳 null，避免將無效網址存入資料庫
            if (!response.ok) {
                console.warn(`圖片抓取失敗 (狀態: ${response.status}): ${externalUrl}`);
                return null;
            }
            arrayBuffer = await response.arrayBuffer();
            contentType = response.headers.get('content-type') || 'image/jpeg';
        } else {
            // 若是不支援的格式 (例如相對路徑)，則直接退回
            return externalUrl;
        }

        // 3. 寫入 R2
        await env.BUCKET.put(fileName, arrayBuffer, {
            httpMetadata: { contentType }
        });

        // 4. 回傳您專屬的 R2 圖片網址
        return `${R2_PUBLIC_URL}/${fileName}`;

    } catch (error) {
        console.error("R2 上傳失敗:", error);
        // 🌟 修正：發生任何其他錯誤時，也回傳 null
        return null;
    }
}

// 🌟 fetchSeriesAndGroups/updateSeriesApi/insertSeries/fetchChannels 都已經移除。
// 原因：這幾個函式一樣是從這個 'use server' 檔案 export、被 client component
// (app/admin/sync/page.tsx) 直接呼叫，跟 upsertCards/upsertBatches 一樣會被
// Next.js 包成 Server Action RPC，在 Cloudflare Pages 上 405、前端還會靜默吞掉
// 錯誤（例如「儲存 API ID」「新增系列」顯示成功但其實沒寫入、批次同步的通路
// 名稱永遠比對不到）。現在改成直接在 page.tsx 裡用 plain fetch 打共用的
// /api/data route（GET 查 channels、POST action:'update'/'insert' 查/寫 series）。

// 🌟 upsertCards/upsertBatches 已搬到 app/admin/sync/page.tsx 裡直接呼叫
// /api/crawler/upsert-cards、/api/crawler/upsert-batches（plain fetch，非 Server Action）。
// 原因：只要函式還是從這個 'use server' 檔案 export、被 client component 直接呼叫，
// 即使函式內部改成呼叫 API route，Next.js 還是會把呼叫包成 Server Action RPC
// （POST 到當前頁面路徑），這在 Cloudflare Pages 上會 405 且前端會靜默吞掉錯誤，
// 導致「顯示同步完成，但資料庫沒寫入」。務必只能用 plain fetch 呼叫 API route。

export async function upsertPocaCards(pocaCards: any[]) {
    if (!pocaCards || pocaCards.length === 0) return { success: true, count: 0 };

    try {
        // 🌟 改為呼叫 API route，避免 Server Action 在 Cloudflare Pages 上的 405 錯誤
        const res = await fetch('/api/poca/upsert', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: pocaCards })
        });
        if (!res.ok) {
            const errorText = await res.text();
            return { success: false, error: `API Error: ${res.status} ${errorText}` };
        }
        return await res.json();
    } catch (error: any) {
        console.error("🔥 upsertPocaCards 嚴重錯誤:", error);
        return { success: false, error: error.message };
    }
}
