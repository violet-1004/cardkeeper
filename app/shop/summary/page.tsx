'use client';

import { useCallback, useEffect, useState } from 'react';
import { priceTagClass } from '@/lib/shop';
import { useShop } from '../ShopProvider';

interface Item {
    cardId: number; title: string; memberName: string; image: string;
    price: number; isBlack: boolean; color: string; status: 'pending' | 'won' | 'sold_out';
}
interface Participant { rank: number; name: string; total: number; black: number; items: Item[] }
interface Summary {
    round: string; closed: boolean; cutoffAt: number; openRound: string; previousRound: string;
    now: number; participants: Participant[];
}

const AVATAR_COLORS = ['#9B90C2', '#E87A90', '#81C7D4', '#91B493', '#F2B872', '#7C9CD6', '#C9A0DC'];
const avatarColor = (name: string) => {
    let h = 0;
    for (const ch of name) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
    return AVATAR_COLORS[h % AVATAR_COLORS.length];
};
const initial = (name: string) => Array.from(name)[0]?.toUpperCase() || '?';

function Avatar({ name, size = 56 }: { name: string; size?: number }) {
    return (
        <div
            className="flex shrink-0 items-center justify-center rounded-full font-bold text-white"
            style={{ width: size, height: size, background: avatarColor(name), fontSize: size * 0.42 }}
        >
            {initial(name)}
        </div>
    );
}

export default function SummaryPage() {
    const { name: me } = useShop();
    const [which, setWhich] = useState<'open' | 'previous'>('open');
    const [data, setData] = useState<Summary | null>(null);
    const [error, setError] = useState('');
    const [selected, setSelected] = useState<Participant | null>(null);

    const load = useCallback(async () => {
        try {
            const q = which === 'previous' && data ? `?round=${data.previousRound}` : '';
            const res = await fetch(`/api/shop/summary${q}`);
            if (!res.ok) throw new Error();
            setData(await res.json());
            setError('');
        } catch {
            setError('載入失敗，請稍後再試');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [which, data?.previousRound]);

    useEffect(() => {
        load();
        const t = setInterval(load, 30000);
        return () => clearInterval(t);
    }, [load]);

    // 打開的視窗要跟著最新資料（例如結單後狀態變化）
    useEffect(() => {
        if (selected && data) setSelected(data.participants.find((p) => p.name === selected.name) || null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data]);

    if (error && !data) return <div className="p-10 text-center text-gray-500">{error}</div>;
    if (!data) return <div className="p-10 text-center text-gray-400">載入中…</div>;

    const grandTotal = data.participants.reduce((s, p) => s + p.total, 0);

    return (
        <main className="mx-auto max-w-4xl px-3 pb-16 pt-4 sm:px-4">
            <div className="mb-3 flex items-center justify-between">
                <div className="flex rounded-full bg-white p-1 shadow-sm">
                    <button
                        onClick={() => setWhich('open')}
                        className={`rounded-full px-4 py-1.5 text-sm font-bold ${which === 'open' ? 'bg-[#9B90C2] text-white' : 'text-gray-500'}`}
                    >
                        本期
                    </button>
                    <button
                        onClick={() => setWhich('previous')}
                        className={`rounded-full px-4 py-1.5 text-sm font-bold ${which === 'previous' ? 'bg-[#9B90C2] text-white' : 'text-gray-500'}`}
                    >
                        上期結果
                    </button>
                </div>
                <div className="text-right text-xs text-gray-400">
                    <div>{data.round} 場次 ・ {data.closed ? '已結單' : '進行中（23:00 結單）'}</div>
                    <div>{data.participants.length} 人參與 ・ 總計 ${grandTotal}</div>
                </div>
            </div>

            {data.closed && (
                <div className="mb-3 rounded-xl bg-white p-3 text-xs text-gray-500 shadow-sm">
                    順位規則：黑字金額高到低，相同時再比總金額高到低；卡片先出給順位前面的人，已售出的卡會被打叉。
                </div>
            )}

            {data.participants.length === 0 && <div className="py-16 text-center text-gray-400">這一期還沒有人送出訂單</div>}

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {data.participants.map((p) => {
                    const mine = me && p.name.toLowerCase() === me.toLowerCase();
                    return (
                        <div
                            key={p.name}
                            className={`relative flex flex-col items-center rounded-2xl bg-white p-4 shadow-sm ${mine ? 'ring-2 ring-[#9B90C2]' : ''}`}
                        >
                            <span className="absolute left-3 top-2 text-[11px] font-bold text-gray-300">#{p.rank}</span>
                            <button onClick={() => setSelected(p)} title="查看選購的小卡" className="transition-transform active:scale-95">
                                <Avatar name={p.name} />
                            </button>
                            <div className="mt-2 max-w-full truncate text-sm font-bold text-gray-800">{p.name}{mine ? '（我）' : ''}</div>
                            <div className="mt-1 text-xs text-gray-500">總金額 <span className="font-bold text-gray-800">${p.total}</span></div>
                            <div className="text-xs text-gray-500">黑字金額 <span className="font-black text-black">${p.black}</span></div>
                        </div>
                    );
                })}
            </div>

            {selected && (
                <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/40 sm:items-center" onClick={() => setSelected(null)}>
                    <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-t-3xl bg-white sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-4">
                            <Avatar name={selected.name} size={44} />
                            <div className="min-w-0 flex-1">
                                <div className="truncate font-bold">{selected.name}</div>
                                <div className="text-xs text-gray-500">
                                    總金額 ${selected.total} ・ 黑字 <span className="font-black text-black">${selected.black}</span>
                                </div>
                            </div>
                            <button onClick={() => setSelected(null)} className="text-sm text-gray-400">關閉</button>
                        </div>
                        <div className="grid grid-cols-3 gap-2 overflow-y-auto p-4">
                            {selected.items.map((it) => (
                                <div key={it.cardId} className="flex flex-col gap-1">
                                    <div className="relative aspect-[2/3] overflow-hidden rounded-lg border border-gray-100 bg-gray-100">
                                        {it.image && (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img src={it.image} alt={it.title} loading="lazy" decoding="async" className={`absolute inset-0 h-full w-full object-cover ${it.status === 'sold_out' ? 'opacity-40 grayscale' : ''}`} />
                                        )}
                                        {it.status === 'sold_out' && (
                                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                                                <svg viewBox="0 0 24 24" className="h-2/3 w-2/3 text-red-500" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                                    <path d="M5 5l14 14M19 5L5 19" />
                                                </svg>
                                                <span className="-mt-2 rounded bg-red-500 px-1.5 text-[10px] font-bold text-white">已售出</span>
                                            </div>
                                        )}
                                        {it.status === 'won' && (
                                            <div className="absolute right-1 top-1 rounded-full bg-green-500 px-1.5 py-0.5 text-[10px] font-bold text-white">✓</div>
                                        )}
                                        <div className="absolute bottom-1.5 left-0 w-full text-center">
                                            <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-bold text-white shadow ${priceTagClass(it.color)}`}>${it.price}</span>
                                        </div>
                                    </div>
                                    <div className="line-clamp-2 text-[11px] font-bold leading-tight">{it.title}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}
