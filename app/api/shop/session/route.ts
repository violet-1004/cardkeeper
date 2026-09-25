import { getDb, ensureShopSchema, json, fail, readJson, clientIp, rateLimit, sha256Hex, randomToken } from '@/lib/shopServer';
import { normalizeName, nameKey } from '@/lib/shop';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// 登記/確認 FB 帳號名。第一次登記會發一組裝置 token（只存雜湊），之後操作購物車與訂單都要帶。
export async function POST(req: Request) {
    try {
        const db = getDb();
        await ensureShopSchema(db);
        const ip = clientIp(req);
        if (!(await rateLimit(db, 'session', ip, 20, 600))) return fail('操作太頻繁，請稍後再試', 429);

        const body = await readJson(req, 2048);
        const name = normalizeName(body?.name);
        if (!name) return fail('請輸入 1–40 字的 FB 帳號名');
        const token = typeof body?.token === 'string' ? body.token : '';
        const key = nameKey(name);

        const row = await db.prepare(`SELECT name, token_hash FROM shop_users WHERE user_key = ?`).bind(key).first();
        if (row) {
            if (token.length >= 32 && token.length <= 128 && (await sha256Hex(token)) === row.token_hash) {
                return json({ name: row.name });
            }
            return fail('此帳號名已被其他裝置使用，若是您本人請聯絡賣家', 409);
        }

        if (!(await rateLimit(db, 'register', ip, 5, 3600))) return fail('登記次數過多，請稍後再試', 429);
        const newToken = randomToken();
        await db
            .prepare(`INSERT OR IGNORE INTO shop_users (user_key, name, token_hash, created_at) VALUES (?, ?, ?, ?)`)
            .bind(key, name, await sha256Hex(newToken), new Date().toISOString())
            .run();
        // 若同時有人搶登記同名，INSERT OR IGNORE 只會有一方成功；用雜湊再確認一次
        const check = await db.prepare(`SELECT token_hash FROM shop_users WHERE user_key = ?`).bind(key).first();
        if (check?.token_hash !== (await sha256Hex(newToken))) return fail('此帳號名已被使用', 409);
        return json({ name, token: newToken });
    } catch (e) {
        console.error('shop session error', e);
        return fail('登記失敗，請稍後再試', 500);
    }
}
