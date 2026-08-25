// 共用的 R2 圖片轉存工具，給 Server Action (app/admin/actions.ts) 與
// API Route (app/api/crawler/upsert-*/route.ts) 共用，避免互相 import 造成打包問題。
export async function uploadImageToR2(env: any, externalUrl: string, fileName: string) {
    try {
        if (!env.BUCKET) throw new Error("R2 尚未綁定");

        const R2_PUBLIC_URL = env.R2_PUBLIC_URL || "https://pub-f5a70c4f84d841ada9cbda4eafbb30ee.r2.dev";

        let arrayBuffer: ArrayBuffer;
        let contentType: string;

        if (externalUrl.startsWith('http')) {
            const response = await fetch(externalUrl);
            if (!response.ok) {
                console.warn(`圖片抓取失敗 (狀態: ${response.status}): ${externalUrl}`);
                return null;
            }
            arrayBuffer = await response.arrayBuffer();
            contentType = response.headers.get('content-type') || 'image/jpeg';
        } else {
            return externalUrl;
        }

        await env.BUCKET.put(fileName, arrayBuffer, {
            httpMetadata: { contentType }
        });

        return `${R2_PUBLIC_URL}/${fileName}`;
    } catch (error) {
        console.error("R2 上傳失敗:", error);
        return null;
    }
}
