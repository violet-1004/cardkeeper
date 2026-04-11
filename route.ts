import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const env = getRequestContext().env as any;
        
        return NextResponse.json({ 
            success: true, 
            message: "Edge 執行環境正常運作！",
            hasEnv: !!env,
            hasDBBinding: !!(env && env.DB),
            envKeys: env ? Object.keys(env) : []
        });
    } catch (error: any) {
        console.error("Test API 錯誤:", error);
        return NextResponse.json({ error: error.message || String(error) }, { status: 400 });
    }
}