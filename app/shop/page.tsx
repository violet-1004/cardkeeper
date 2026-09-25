'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { priceTagClass } from '@/lib/shop';
import { useShop } from './ShopProvider';

interface Card {
    id: number; image: string; title: string; memberName: string; groupId: number | null;
    memberIds: number[]; seriesId: number | null; subunit: string | null;
    typeName: string | null; channelName: string | null; price: number; color: string; quantity: number;
}
interface Catalog {
    cards: Card[];
    groups: { id: number; name: string }[];
    members: { id: number; groupId: number | null; name: string; subunit: string | null; sortOrder: number }[];
    series: { id: number; groupId: number | null; name: string }[];
    subunits: { groupId: number | null; name: string; sortOrder: number }[];
    round: string; cutoffAt: number; now: number;
}

const PAGE_SIZE = 60;
const COLOR_LABEL: Record<string, string> = {
    'bg-black/70': '黑', 'bg-[#E87A90]': '紅', 'bg-[#986DB2]': '深紫', 'bg-[#81C7D4]': '淺紫',
};

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            onClick={onClick}
            className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-xs transition-colors ${
                active ? 'border-[#9B90C2] bg-[#9B90C2] font-bold text-white' : 'border-gray-200 bg-white text-gray-600'
            }`}
        >
            {children}
        </button>
    );
}

function formatRemaining(ms: number) {
    if (ms <= 0) return '已結單';
    const s = Math.floor(ms / 1000);
    const h = String(Math.floor(s / 3600)).padStart(2, '0');
    const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    const sec = String(s % 60).padStart(2, '0');
    return `${h}:${m}:${sec}`;
}

export default function ShopPage() {
    const { name, ready, api } = useShop();
    const [catalog, setCatalog] = useState<Catalog | null>(null);
    const [loadError, setLoadError] = useState('');
    const [cart, setCart] = useState<number[]>([]);
    const [cartOpen, setCartOpen] = useState(false);
    const [confirming, setConfirming] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
    const [remaining, setRemaining] = useState(0);
    const clockOffset = useRef(0);
    const refreshedFor = useRef(0);

    const [groupId, setGroupId] = useState<number | 'All'>('All');
    const [subunit, setSubunit] = useState('All');
    const [memberId, setMemberId] = useState<number | 'All'>('All');
    const [seriesId, setSeriesId] = useState<number | 'All'>('All');
    const [typeName, setTypeName] = useState('All');
    const [channelName, setChannelName] = useState('All');
    const [colorClass, setColorClass] = useState('All');
    const [visible, setVisible] = useState(PAGE_SIZE);
    const sentinel = useRef<HTMLDivElement | null>(null);

    const loadCatalog = useCallback(async () => {
        try {
            const res = await fetch('/api/shop/catalog');
            if (!res.ok) throw new Error();
            const data = (await res.json()) as Catalog;
            clockOffset.current = data.now - Date.now();
            setCatalog(data);
            setLoadError('');
        } catch {
            setLoadError('載入失敗，請重新整理');
        }
    }, []);

    useEffect(() => {
        loadCatalog();
        const t = setInterval(loadCatalog, 60000);
        return () => clearInterval(t);
    }, [loadCatalog]);

    useEffect(() => {
        if (!catalog) return;
        const tick = () => {
            const left = catalog.cutoffAt - (Date.now() + clockOffset.current);
            setRemaining(left);
            // 過了 23:00 就重新取得新一期的截止時間（訂單會自動算入下一期）
            if (left <= 0 && refreshedFor.current !== catalog.cutoffAt) {
                refreshedFor.current = catalog.cutoffAt;
                loadCatalog();
            }
        };
        tick();
        const t = setInterval(tick, 1000);
        return () => clearInterval(t);
    }, [catalog, loadCatalog]);

    // 進站/換帳號時，從伺服器取回暫存的購物車
    useEffect(() => {
        if (!ready || !name) { setCart([]); return; }
        (async () => {
            const res = await api('/api/shop/cart');
            if (res.ok) setCart((((await res.json()) as any).cardIds as number[]) || []);
        })();
    }, [ready, name, api]);

    const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const persistCart = useCallback((ids: number[]) => {
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => { api('/api/shop/cart', { method: 'PUT', body: JSON.stringify({ cardIds: ids }) }); }, 300);
    }, [api]);

    const toggleCart = (id: number) => {
        setCart((prev) => {
            const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
            persistCart(next);
            return next;
        });
    };

    const cardsById = useMemo(() => new Map((catalog?.cards || []).map((c) => [c.id, c])), [catalog]);
    const cartCards = useMemo(() => cart.map((id) => cardsById.get(id)).filter(Boolean) as Card[], [cart, cardsById]);
    const cartTotal = cartCards.reduce((s, c) => s + c.price, 0);
    const soldOutInCart = cart.length - cartCards.length;

    const scoped = useMemo(() => (catalog?.cards || []).filter((c) => groupId === 'All' || c.groupId === groupId), [catalog, groupId]);
    const subunitOptions = useMemo(
        () => [...new Set(scoped.map((c) => c.subunit).filter(Boolean) as string[])],
        [scoped]
    );
    const afterSubunit = useMemo(() => scoped.filter((c) => subunit === 'All' || c.subunit === subunit), [scoped, subunit]);
    const memberOptions = useMemo(() => {
        const ids = new Set(afterSubunit.flatMap((c) => c.memberIds));
        return (catalog?.members || []).filter((m) => ids.has(m.id)).sort((a, b) => a.sortOrder - b.sortOrder);
    }, [afterSubunit, catalog]);
    const seriesOptions = useMemo(() => {
        const ids = new Set(afterSubunit.map((c) => c.seriesId));
        return (catalog?.series || []).filter((s) => ids.has(s.id));
    }, [afterSubunit, catalog]);
    const typeOptions = useMemo(() => [...new Set(afterSubunit.map((c) => c.typeName).filter(Boolean) as string[])], [afterSubunit]);
    const channelOptions = useMemo(() => [...new Set(afterSubunit.map((c) => c.channelName).filter(Boolean) as string[])], [afterSubunit]);
    const colorOptions = useMemo(() => [...new Set(afterSubunit.map((c) => priceTagClass(c.color)))], [afterSubunit]);

    const filtered = useMemo(
        () =>
            afterSubunit.filter(
                (c) =>
                    (memberId === 'All' || c.memberIds.includes(memberId)) &&
                    (seriesId === 'All' || c.seriesId === seriesId) &&
                    (typeName === 'All' || c.typeName === typeName) &&
                    (channelName === 'All' || c.channelName === channelName) &&
                    (colorClass === 'All' || priceTagClass(c.color) === colorClass)
            ),
        [afterSubunit, memberId, seriesId, typeName, channelName, colorClass]
    );

    const filterSig = [groupId, subunit, memberId, seriesId, typeName, channelName, colorClass].join('|');
    useEffect(() => setVisible(PAGE_SIZE), [filterSig]);
    useEffect(() => {
        const el = sentinel.current;
        if (!el || typeof IntersectionObserver === 'undefined') return;
        const io = new IntersectionObserver((e) => e[0].isIntersecting && setVisible((v) => v + PAGE_SIZE), { rootMargin: '600px 0px' });
        io.observe(el);
        return () => io.disconnect();
    }, [visible, filtered.length]);

    const submit = async () => {
        setSubmitting(true);
        try {
            // 先把最新購物車寫到伺服器，再送出
            if (saveTimer.current) clearTimeout(saveTimer.current);
            const saved = await api('/api/shop/cart', { method: 'PUT', body: JSON.stringify({ cardIds: cart }) });
            if (!saved.ok) throw new Error(((await saved.json()) as any).error || '儲存購物車失敗');
            const res = await api('/api/shop/submit', { method: 'POST', body: '{}' });
            const data: any = await res.json();
            if (!res.ok) throw new Error(data.error || '送出失敗');
            setCart([]);
            setConfirming(false);
            setCartOpen(false);
            setNotice({ ok: true, text: `已送出 ${data.submitted.length} 張，可到「總結」查看${data.skipped.length ? `（${data.skipped.length} 張已下架未送出）` : ''}` });
            loadCatalog();
        } catch (e: any) {
            setNotice({ ok: false, text: e.message || '送出失敗' });
            setConfirming(false);
        } finally {
            setSubmitting(false);
        }
    };

    if (loadError) return <div className="p-10 text-center text-gray-500">{loadError}</div>;
    if (!catalog) return <div className="p-10 text-center text-gray-400">載入中…</div>;

    return (
        <main className="mx-auto max-w-6xl px-3 pb-28 pt-4 sm:px-4">
            <div className="mb-3 flex items-center justify-between rounded-2xl bg-white p-3 shadow-sm">
                <div className="text-sm text-gray-500">
                    每日 23:00 結單 ・ 本期 {catalog.round}
                </div>
                <div className="font-mono text-sm font-bold text-[#7C739B]">{formatRemaining(remaining)}</div>
            </div>

            {notice && (
                <div className={`mb-3 flex items-center justify-between rounded-xl px-4 py-2.5 text-sm ${notice.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                    <span>{notice.text} {notice.ok && <Link href="/shop/summary" className="font-bold underline">前往總結</Link>}</span>
                    <button onClick={() => setNotice(null)} className="ml-3 text-xs opacity-60">關閉</button>
                </div>
            )}

            <div className="mb-3 space-y-2 rounded-2xl bg-white p-3 shadow-sm">
                {catalog.groups.length > 1 && (
                    <div className="flex gap-1.5 overflow-x-auto">
                        <Chip active={groupId === 'All'} onClick={() => { setGroupId('All'); setSubunit('All'); setMemberId('All'); setSeriesId('All'); }}>全部團體</Chip>
                        {catalog.groups.filter((g) => catalog.cards.some((c) => c.groupId === g.id)).map((g) => (
                            <Chip key={g.id} active={groupId === g.id} onClick={() => { setGroupId(g.id); setSubunit('All'); setMemberId('All'); setSeriesId('All'); }}>{g.name}</Chip>
                        ))}
                    </div>
                )}
                {subunitOptions.length > 0 && (
                    <div className="flex gap-1.5 overflow-x-auto">
                        <Chip active={subunit === 'All'} onClick={() => { setSubunit('All'); setMemberId('All'); }}>全部分隊</Chip>
                        {subunitOptions.map((s) => <Chip key={s} active={subunit === s} onClick={() => { setSubunit(s); setMemberId('All'); }}>{s}</Chip>)}
                    </div>
                )}
                <div className="flex gap-1.5 overflow-x-auto">
                    <Chip active={memberId === 'All'} onClick={() => setMemberId('All')}>全部成員</Chip>
                    {memberOptions.map((m) => <Chip key={m.id} active={memberId === m.id} onClick={() => setMemberId(m.id)}>{m.name}</Chip>)}
                </div>
                {seriesOptions.length > 1 && (
                    <div className="flex gap-1.5 overflow-x-auto">
                        <Chip active={seriesId === 'All'} onClick={() => setSeriesId('All')}>全部系列</Chip>
                        {seriesOptions.map((s) => <Chip key={s.id} active={seriesId === s.id} onClick={() => setSeriesId(s.id)}>{s.name}</Chip>)}
                    </div>
                )}
                {typeOptions.length > 1 && (
                    <div className="flex gap-1.5 overflow-x-auto">
                        <Chip active={typeName === 'All'} onClick={() => setTypeName('All')}>全部子類</Chip>
                        {typeOptions.map((t) => <Chip key={t} active={typeName === t} onClick={() => setTypeName(t)}>{t}</Chip>)}
                    </div>
                )}
                {channelOptions.length > 1 && (
                    <div className="flex gap-1.5 overflow-x-auto">
                        <Chip active={channelName === 'All'} onClick={() => setChannelName('All')}>全部通路</Chip>
                        {channelOptions.map((t) => <Chip key={t} active={channelName === t} onClick={() => setChannelName(t)}>{t}</Chip>)}
                    </div>
                )}
                {colorOptions.length > 1 && (
                    <div className="flex items-center gap-2">
                        <Chip active={colorClass === 'All'} onClick={() => setColorClass('All')}>全部顏色</Chip>
                        {colorOptions.map((c) => (
                            <button
                                key={c}
                                title={COLOR_LABEL[c]}
                                onClick={() => setColorClass(colorClass === c ? 'All' : c)}
                                className={`h-6 w-6 rounded-full border-2 ${c} ${colorClass === c ? 'border-gray-700 ring-1 ring-gray-400' : 'border-transparent opacity-60'}`}
                            />
                        ))}
                    </div>
                )}
            </div>

            <div className="mb-2 px-1 text-xs text-gray-400">共 {filtered.length} 張</div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 lg:gap-3">
                {filtered.slice(0, visible).map((card) => {
                    const inCart = cart.includes(card.id);
                    return (
                        <button
                            key={card.id}
                            onClick={() => toggleCart(card.id)}
                            className="group relative flex select-none flex-col gap-1 text-left"
                        >
                            <div className={`relative aspect-[2/3] overflow-hidden rounded-lg border-2 bg-gray-100 ${inCart ? 'border-[#9B90C2] ring-2 ring-[#9B90C2]' : 'border-gray-100'}`}>
                                {card.image && (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={card.image} alt={card.title} loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
                                )}
                                {card.quantity > 1 && (
                                    <div className="absolute left-1 top-1 rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-bold text-white">x{card.quantity}</div>
                                )}
                                {inCart && <div className="absolute right-1 top-1 rounded-full bg-[#9B90C2] px-1.5 py-0.5 text-[10px] font-bold text-white">已加入</div>}
                                <div className="absolute bottom-1.5 left-0 w-full text-center">
                                    <span className={`inline-block max-w-full truncate rounded-full px-2.5 py-0.5 text-xs font-bold text-white shadow-md ${priceTagClass(card.color)}`}>
                                        ${card.price}
                                    </span>
                                </div>
                            </div>
                            <div className="px-0.5">
                                <div className="text-[10px] font-bold uppercase text-gray-400">{card.memberName}</div>
                                <div className="line-clamp-2 text-xs font-bold leading-tight text-gray-800">{card.title}</div>
                            </div>
                        </button>
                    );
                })}
            </div>
            {filtered.length === 0 && <div className="py-16 text-center text-gray-400">目前沒有符合條件的小卡</div>}
            {visible < filtered.length && <div ref={sentinel} className="py-6 text-center text-xs text-gray-400">載入更多…</div>}

            <button
                onClick={() => setCartOpen(true)}
                className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-[#9B90C2] px-5 py-3 font-bold text-white shadow-lg"
            >
                購物車 <span className="rounded-full bg-white/25 px-2 text-sm">{cart.length}</span>
            </button>

            {cartOpen && (
                <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/40 sm:items-center" onClick={() => !submitting && setCartOpen(false)}>
                    <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-t-3xl bg-white sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
                            <h2 className="text-lg font-bold">購物車（{cartCards.length}）</h2>
                            <button onClick={() => setCartOpen(false)} className="text-sm text-gray-400">關閉</button>
                        </div>
                        <div className="flex-1 space-y-2 overflow-y-auto p-4">
                            {cartCards.length === 0 && <div className="py-10 text-center text-gray-400">購物車是空的</div>}
                            {soldOutInCart > 0 && <div className="rounded-lg bg-amber-50 p-2 text-xs text-amber-700">有 {soldOutInCart} 張已下架，送出時會自動略過</div>}
                            {cartCards.map((c) => (
                                <div key={c.id} className="flex items-center gap-3 rounded-xl border border-gray-100 p-2">
                                    <div className="relative h-16 w-11 shrink-0 overflow-hidden rounded bg-gray-100">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        {c.image && <img src={c.image} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="truncate text-[11px] text-gray-400">{c.memberName}</div>
                                        <div className="truncate text-sm font-bold">{c.title}</div>
                                    </div>
                                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold text-white ${priceTagClass(c.color)}`}>${c.price}</span>
                                    <button onClick={() => toggleCart(c.id)} className="p-1 text-xs text-gray-400">移除</button>
                                </div>
                            ))}
                        </div>
                        <div className="border-t border-gray-100 p-4">
                            <div className="mb-3 flex justify-between font-bold"><span>合計</span><span>${cartTotal}</span></div>
                            <button
                                disabled={cartCards.length === 0}
                                onClick={() => setConfirming(true)}
                                className="w-full rounded-xl bg-[#9B90C2] py-3 font-bold text-white disabled:opacity-40"
                            >
                                送出訂單
                            </button>
                            <p className="mt-2 text-center text-[11px] text-gray-400">送出後才算確認購買，且無法自行取消</p>
                        </div>
                    </div>
                </div>
            )}

            {confirming && (
                <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/50 p-4">
                    <div className="w-full max-w-sm rounded-3xl bg-white p-6">
                        <h3 className="text-lg font-bold">確認送出？</h3>
                        <p className="mt-2 text-sm text-gray-500">共 {cartCards.length} 張、合計 ${cartTotal}。送出後視為確認購買，結單後依順位出貨。</p>
                        <div className="mt-5 flex gap-2">
                            <button disabled={submitting} onClick={() => setConfirming(false)} className="flex-1 rounded-xl bg-gray-100 py-2.5 font-bold text-gray-600">再看看</button>
                            <button disabled={submitting} onClick={submit} className="flex-1 rounded-xl bg-[#9B90C2] py-2.5 font-bold text-white">{submitting ? '送出中…' : '確認送出'}</button>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}
