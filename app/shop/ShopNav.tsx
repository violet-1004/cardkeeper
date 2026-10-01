'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useShop } from './ShopProvider';

export function ShopNav() {
    const path = usePathname();
    const { name, logout } = useShop();

    // 解析目前在哪個團體底下：/shop、/shop/summary、/shop/<group>、/shop/<group>/summary
    const segs = path.split('/').filter(Boolean); // ['shop', ...]
    const isSummaryPath = segs[segs.length - 1] === 'summary';
    const group = segs[1] && segs[1] !== 'summary' ? segs[1] : null;

    const selectHref = group ? `/shop/${group}` : '/shop';
    const summaryHref = group ? `/shop/${group}/summary` : '/shop/summary';

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
                    {tab(selectHref, '選購', !isSummaryPath)}
                    {tab(summaryHref, '總結', isSummaryPath)}
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
