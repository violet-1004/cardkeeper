'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useShop } from './ShopProvider';

export function ShopNav() {
    const path = usePathname();
    const { name, logout } = useShop();
    const tab = (href: string, label: string) => (
        <Link
            href={href}
            className={`rounded-full px-4 py-1.5 text-sm font-bold transition-colors ${
                path === href ? 'bg-[#9B90C2] text-white' : 'text-gray-500 hover:bg-gray-100'
            }`}
        >
            {label}
        </Link>
    );
    return (
        <nav className="sticky top-0 z-30 border-b border-gray-100 bg-white">
            <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
                <div className="flex items-center gap-1">
                    {tab('/shop', '選購')}
                    {tab('/shop/summary', '總結')}
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
