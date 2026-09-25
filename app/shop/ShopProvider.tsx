'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

interface ShopCtx {
    name: string | null;
    ready: boolean;
    api: (path: string, init?: RequestInit) => Promise<Response>;
    logout: () => void;
}

const Ctx = createContext<ShopCtx | null>(null);
export const useShop = () => {
    const c = useContext(Ctx);
    if (!c) throw new Error('useShop must be used inside ShopProvider');
    return c;
};

const NAME_KEY = 'shop:name';
const TOKEN_KEY = 'shop:token';

const read = (k: string) => {
    try { return localStorage.getItem(k); } catch { return null; }
};
const write = (k: string, v: string | null) => {
    try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* 隱私模式等情況無法存 */ }
};

export function ShopProvider({ children }: { children: React.ReactNode }) {
    const [name, setName] = useState<string | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [ready, setReady] = useState(false);
    const [input, setInput] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    const register = useCallback(async (n: string, t: string | null) => {
        const res = await fetch('/api/shop/session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: n, token: t || undefined }),
        });
        const data: any = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || '登入失敗');
        return data as { name: string; token?: string };
    }, []);

    useEffect(() => {
        (async () => {
            const n = read(NAME_KEY);
            const t = read(TOKEN_KEY);
            if (n && t) {
                try {
                    const r = await register(n, t);
                    setName(r.name);
                    setToken(t);
                } catch {
                    write(NAME_KEY, null);
                    write(TOKEN_KEY, null);
                }
            }
            setReady(true);
        })();
    }, [register]);

    const submitName = async () => {
        setBusy(true);
        setError('');
        try {
            const r = await register(input, read(TOKEN_KEY));
            const t = r.token || read(TOKEN_KEY);
            if (!t) throw new Error('登入失敗，請重試');
            write(NAME_KEY, r.name);
            write(TOKEN_KEY, t);
            setName(r.name);
            setToken(t);
        } catch (e: any) {
            setError(e.message || '登入失敗');
        } finally {
            setBusy(false);
        }
    };

    const api = useCallback(
        (path: string, init: RequestInit = {}) =>
            fetch(path, {
                ...init,
                headers: {
                    'Content-Type': 'application/json',
                    ...(init.headers || {}),
                    'x-shop-user': encodeURIComponent(name || ''),
                    'x-shop-token': token || '',
                },
            }),
        [name, token]
    );

    const logout = useCallback(() => {
        write(NAME_KEY, null);
        write(TOKEN_KEY, null);
        setName(null);
        setToken(null);
        setInput('');
    }, []);

    const value = useMemo(() => ({ name, ready, api, logout }), [name, ready, api, logout]);

    return (
        <Ctx.Provider value={value}>
            {children}
            {ready && !name && (
                <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 p-4">
                    <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl">
                        <h2 className="text-lg font-bold text-gray-800">歡迎選購</h2>
                        <p className="mt-1 text-sm text-gray-500">請輸入您的 FB 帳號名，購物車與訂單會以此名稱記錄。</p>
                        <input
                            autoFocus
                            value={input}
                            maxLength={40}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && input.trim() && !busy && submitName()}
                            placeholder="FB 帳號名"
                            className="mt-4 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base outline-none focus:border-[#9B90C2] focus:ring-2 focus:ring-[#9B90C2]/30"
                        />
                        {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
                        <button
                            onClick={submitName}
                            disabled={!input.trim() || busy}
                            className="mt-4 w-full rounded-xl bg-[#9B90C2] py-2.5 font-bold text-white disabled:opacity-40"
                        >
                            {busy ? '確認中…' : '開始選購'}
                        </button>
                    </div>
                </div>
            )}
        </Ctx.Provider>
    );
}
