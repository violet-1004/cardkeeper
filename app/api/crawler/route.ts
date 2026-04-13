import { NextResponse } from 'next/server';

export const runtime = 'edge';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const planets = searchParams.get('planets');

        // 這裡預留給未來的爬蟲邏輯
        // 目前先回傳成功訊息，避免前端跳出 404 錯誤導致崩潰
        
        return NextResponse.json({ 
            success: true,
            message: `成功接收到同步請求 (${planets})。爬蟲功能建置中...`,
            data: [] 
        });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}