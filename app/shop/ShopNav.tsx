'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useShop } from './ShopProvider';

export function ShopNav() {
    const path = usePathname();
    const { name, logout } = useShop();
    // 「選購」在 /shop 以及任何 /shop/<團體> 分頁都算啟用中，只有 /shop/summary 算「總結」
    const isSelecting = path === '/shop' || (path.startsWith('/shop/') && !path.startsWith('/shop/summary'));
    const tab = (href: string, label: string, active: boolean) => (
        <Link
            href={href}
            className={`rounded-full px-4 py-1.5 text-sm font-bold transition-colors ${
                active ? 'bg-[#9B90C2] text-white' : 'text-gray-500 hover:bg-gray-100'
            }`}
        >
            {label}
        </Link>
    );
    return (
        <nav className="sticky top-0 z-30 border-b border-gray-100 bg-white">
            <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
                <div className="flex items-center gap-1">
                    {tab('/shop', '選購', isSelecting)}
                    {tab('/shop/summary', '總結', path.startsWith('/shop/summary'))}
                </div>
                {name && (
                    <button onClick={logout} className="max-w-[45%] truncate text-xs text-gray-400" title="切換帳號">
                        {name} ・ 切換
                    </button>
                )}
            </div>
        </nav>
    );
}
