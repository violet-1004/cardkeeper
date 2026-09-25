'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';

function LoginForm() {
    const params = useSearchParams();
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    const submit = async () => {
        setBusy(true);
        setError('');
        try {
            const res = await fetch('/api/admin-login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password }),
            });
            const data: any = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || '登入失敗');
            const next = params.get('next') || '/';
            // 只允許站內路徑，避免被導去外部網站
            window.location.href = next.startsWith('/') && !next.startsWith('//') ? next : '/';
        } catch (e: any) {
            setError(e.message || '登入失敗');
            setBusy(false);
        }
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
            <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-lg">
                <h1 className="text-lg font-bold text-gray-800">小卡管家・管理登入</h1>
                <input
                    type="password"
                    autoFocus
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && password && !busy && submit()}
                    placeholder="管理密碼"
                    className="mt-4 w-full rounded-xl border border-gray-200 px-3 py-2.5 outline-none focus:border-[#9B90C2]"
                />
                {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
                <button
                    onClick={submit}
                    disabled={!password || busy}
                    className="mt-4 w-full rounded-xl bg-[#9B90C2] py-2.5 font-bold text-white disabled:opacity-40"
                >
                    {busy ? '登入中…' : '登入'}
                </button>
            </div>
        </div>
    );
}

export default function AdminLoginPage() {
    return (
        <Suspense>
            <LoginForm />
        </Suspense>
    );
}
