'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { RefreshCw, Check, ChevronLeft, ChevronRight, ImageIcon, ArrowLeft, X, Package } from 'lucide-react';
import { supabase } from '@/utils/supabase';
import { toCamelCase, toSnakeCase } from '@/utils/case';

// --- Shared Modal shell ---
const Modal = ({ title, onClose, children, footer, className = "max-w-lg" }) => (
    <div className="fixed inset-0 z-[150] bg-black/30 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
        <div
            className={`bg-white w-full shadow-2xl overflow-hidden flex flex-col rounded-2xl max-h-[90vh] ${className}`}
            onClick={e => e.stopPropagation()}
        >
            <div className="px-4 py-3 border-b border-gray-100 flex justify-between items-center bg-white flex-shrink-0">
                <div className="font-bold text-lg text-gray-800 truncate pr-2 flex-1">{title}</div>
                <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 transition-colors flex-shrink-0">
                    <X className="w-5 h-5 text-gray-500" />
                </button>
            </div>
            <div className="flex-1 overflow-y-auto no-scrollbar relative bg-gray-50/50">
                {children}
            </div>
            {footer && (
                <div className="px-4 py-3 border-t border-gray-100 bg-white flex justify-end gap-3 flex-shrink-0">
                    {footer}
                </div>
            )}
        </div>
    </div>
);

// --- Series & Batch filter modal ---
const SeriesFilterModal = ({
    visible, onClose,
    seriesTypes, selectedSeriesType, setSeriesType,
    series, selectedSeries, setSeries,
    batches, selectedBatches, setBatches
}) => {
    if (!visible) return null;

    const RenderList = ({ options, selected, onSelect, label }) => (
        <div className="mb-4">
            <div className="text-xs font-bold text-gray-400 mb-2 uppercase">{label}</div>
            <div className="flex flex-wrap gap-2">
                <button
                    onClick={() => onSelect('All')}
                    className={`px-3 py-1.5 text-xs rounded-full border transition-all ${selected === 'All' ? 'bg-black text-white border-black font-bold' : 'bg-white text-gray-600 border-gray-200'}`}
                >
                    全部
                </button>
                {(options || []).map(opt => {
                    const val = typeof opt === 'object' ? opt.id : opt;
                    const name = typeof opt === 'object' ? opt.name : opt;
                    return (
                        <button
                            key={val}
                            onClick={() => onSelect(val)}
                            className={`px-3 py-1.5 text-xs rounded-full border transition-all ${selected === val ? 'bg-black text-white border-black font-bold' : 'bg-white text-gray-600 border-gray-200'}`}
                        >
                            {name}
                        </button>
                    );
                })}
            </div>
        </div>
    );

    const RenderGridList = ({ options, selected, onSelect, label }) => {
        const toggleSelect = (id) => {
            if (selected.includes(id)) {
                onSelect(selected.filter(x => x !== id));
            } else {
                onSelect([...selected, id]);
            }
        };

        return (
            <div className="mb-4">
                <div className="flex justify-between items-center mb-2">
                    <div className="text-xs font-bold text-gray-400 uppercase">{label}</div>
                    <button
                        onClick={() => onSelect([])}
                        className={`text-[10px] px-2 py-0.5 rounded border ${selected.length === 0 ? 'bg-gray-200 text-gray-600 font-bold' : 'text-gray-400 hover:bg-gray-100'}`}
                    >
                        全部
                    </button>
                </div>
                <div className="grid grid-cols-4 gap-x-2 gap-y-3 max-h-[40vh] overflow-y-auto no-scrollbar pb-2">
                    {(options || []).map(opt => {
                        const isSelected = selected.includes(String(opt.id));
                        return (
                            <div
                                key={opt.id}
                                onClick={() => toggleSelect(String(opt.id))}
                                className="cursor-pointer flex flex-col gap-1 group"
                            >
                                <div className={`relative aspect-square rounded-lg border-2 overflow-hidden flex flex-col items-center justify-center transition-all flex-shrink-0 ${isSelected ? 'border-indigo-600 ring-2 ring-indigo-200 shadow-md' : 'border-gray-100 group-hover:border-gray-300'}`}>
                                    {opt.image ? (
                                        <img src={opt.image} alt={opt.name} className="absolute inset-0 w-full h-full object-cover" />
                                    ) : (
                                        <div className="absolute inset-0 w-full h-full bg-gray-100 flex items-center justify-center text-gray-300">
                                            {label === '系列' ? <ImageIcon className="w-6 h-6" /> : <Package className="w-6 h-6" />}
                                        </div>
                                    )}
                                    {isSelected && (
                                        <div className="absolute top-1 right-1 bg-indigo-600 rounded-full w-4 h-4 flex items-center justify-center shadow z-10">
                                            <Check className="w-3 h-3 text-white" />
                                        </div>
                                    )}
                                </div>
                                <span className={`text-[10px] font-bold text-center leading-tight line-clamp-2 px-0.5 ${isSelected ? 'text-indigo-600' : 'text-gray-600'}`}>
                                    {opt.name}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    return (
        <Modal title="系列與版本篩選" onClose={onClose} className="max-w-md">
            <div className="px-5 py-3 sm:px-6 sm:py-4">
                <RenderList
                    label="系列類型"
                    options={seriesTypes}
                    selected={selectedSeriesType}
                    onSelect={setSeriesType}
                />
                <RenderGridList
                    label="系列"
                    options={series}
                    selected={selectedSeries}
                    onSelect={setSeries}
                />
                {(batches || []).length > 0 && (
                    <RenderGridList
                        label="批次"
                        options={batches}
                        selected={selectedBatches}
                        onSelect={setBatches}
                    />
                )}
            </div>
            <div className="mt-2 pt-3 border-t flex justify-end px-4 pb-4">
                <button onClick={onClose} className="px-6 py-2 bg-black text-white rounded-lg text-sm font-bold w-full">完成</button>
            </div>
        </Modal>
    );
};

export default function SyncPage() {
    // --- State copied from App component ---
    const [groups, setGroups] = useState<any[]>([]);
    const [currentGroupId, setCurrentGroupId] = useState(null);
    const [members, setMembers] = useState<any[]>([]);
    const [series, setSeries] = useState<any[]>([]);
    const [channels, setChannels] = useState<any[]>([]);
    const [types, setTypes] = useState<any[]>([]);
    const [batches, setBatches] = useState<any[]>([]);
    const [cards, setCards] = useState<any[]>([]);
    const [allCards, setAllCards] = useState<any[]>([]);
    const [subunits, setSubunits] = useState<any[]>([]);
    const [appSettings, setAppSettings] = useState<any[]>([]);
    const [prices, setPrices] = useState<any[]>([]);
    const [pocaCards, setPocaCards] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // --- Fetch all data on mount ---
    useEffect(() => {
        async function fetchAllData() {
            const fetchTable = async (t: string, silent = false, options: { paginate?: boolean; orderBy?: string; ascending?: boolean; limit?: number; } = {}) => {
                try {
                    const params = new URLSearchParams({ table: t });
                    if (options.paginate) params.append('paginate', 'true');
                    if (options.orderBy) {
                        params.append('orderBy', options.orderBy);
                        params.append('ascending', String(options.ascending ?? true));
                    }
                    if (options.limit) params.append('limit', String(options.limit));
                    params.append('_t', String(Date.now()));

                    const response = await fetch(`/api/data?${params.toString()}`, { cache: 'no-store' });
                    if (!response.ok) {
                        const errText = await response.text();
                        let errData: { error?: string } = {};
                        try { errData = JSON.parse(errText); } catch (e) {}
                        throw new Error(`API request failed: ${response.status} - ${errData.error || errText.substring(0, 100) || 'Unknown server error'}`);
                    }

                    const result: { data: any[] } = await response.json();
                    if (!silent) console.log(`✅ [${t}] Successfully read ${result.data?.length || 0} records`);

                    return (result.data || []).map(toCamelCase).map(item => {
                        if (typeof item.items === 'string') {
                            try { item.items = JSON.parse(item.items) || []; } catch(e) { item.items = []; }
                        }
                        if (typeof item.memberId2 === 'string') {
                            try { item.memberId2 = JSON.parse(item.memberId2) || []; } catch(e) { item.memberId2 = []; }
                        }
                        ['type', 'channel', 'batchId', 'seriesId', 'subunit'].forEach(k => {
                            if (item[k] === 'null' || item[k] === 'undefined' || item[k] === '') {
                                item[k] = null;
                            }
                        });
                        return item;
                    });

                } catch (error: any) {
                    console.error(`🚨 [${t}] Read failed:`, error.message);
                    if (!silent) alert(`讀取 ${t} 失敗！\n錯誤: ${error.message}`);
                    return [];
                }
            };
            const fetchedGroups = await fetchTable('groups');
            setGroups(fetchedGroups);

            if (fetchedGroups.length > 0) {
                setCurrentGroupId(fetchedGroups[0].id);
            }

            const [fetchedMembers, fetchedSubunits, fetchedSeries, fetchedBatches, fetchedChannels, fetchedTypes, fetchedCards, fetchedAppSettings, fetchedPrices, fetchedPocaCards] = await Promise.all([
                fetchTable('members'),
                fetchTable('ui_subunits'),
                fetchTable('series'),
                fetchTable('batches'),
                fetchTable('channels'),
                fetchTable('types'),
                fetchTable('ui_cards', false, { paginate: true }),
                fetchTable('ui_settings', true),
                fetchTable('price', true),
                fetchTable('poca', false, { paginate: true, orderBy: 'id', ascending: false })
            ]);

            setMembers(fetchedMembers.sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0)));
            setSubunits(fetchedSubunits);
            setSeries(fetchedSeries);
            setBatches(fetchedBatches);
            setChannels(fetchedChannels);
            setTypes(fetchedTypes);
            setCards(fetchedCards);
            setAllCards(fetchedCards);
            setAppSettings(fetchedAppSettings);
            setPrices(fetchedPrices);
            setPocaCards(fetchedPocaCards);
            setLoading(false);
        }
        fetchAllData();
    }, []);

    const currentGroup = (groups || []).find(g => g.id === currentGroupId);

    // 🌟 依目前選取的團體過濾出對應資料，與前台 App 的 currentXxx 邏輯一致
    const currentMembers = useMemo(() => (members || []).filter(m => String(m.groupId) === String(currentGroupId)), [members, currentGroupId]);
    const currentSeriesAll = useMemo(() => (series || []).filter(s => String(s.groupId) === String(currentGroupId)), [series, currentGroupId]);
    const currentBatchesAll = useMemo(() => (batches || []).filter(b => String(b.groupId) === String(currentGroupId)), [batches, currentGroupId]);
    const currentTypesAll = useMemo(() => (types || []).filter(t => String(t.groupId) === String(currentGroupId)), [types, currentGroupId]);
    const currentSubunitsAll = useMemo(() => (subunits || []).filter(s => String(s.groupId) === String(currentGroupId)), [subunits, currentGroupId]);
    const currentCards = useMemo(() => (cards || []).filter(c => String(c.groupId) === String(currentGroupId)), [cards, currentGroupId]);

    // --- Logic ported from the original front-end SyncTab ---
    const [activeSubTab, setActiveSubTab] = useState('poca_match');
    const [isCrawling, setIsCrawling] = useState(false);
    const [syncProgress, setSyncProgress] = useState('');
    const [missingPriceCard, setMissingPriceCard] = useState(null);
    const [manualPriceInput, setManualPriceInput] = useState('');
    const missingPriceResolver = useRef(null);
    const priceMappingRef = useRef({});

    const handleUpdateAppSetting = async (key, value) => {
        setAppSettings(prev => {
            const exists = prev.some(s => s.key === key);
            if (exists) return prev.map(s => s.key === key ? { ...s, value } : s);
            return [...prev, { key, value }];
        });
        const { error } = await supabase.from('ui_settings').upsert({ id: key, key, value });
        if (error) console.error('Error saving setting:', error);
    };

    const handleMissingPriceSubmit = async () => {
        const val = Number(manualPriceInput);
        if (isNaN(val) || val <= 0) return alert("請輸入有效的轉換價格");
        const originalPrice = missingPriceCard.originalPrice;
        priceMappingRef.current[originalPrice] = val;
        handleUpdateAppSetting('poca_price_mapping', JSON.stringify(priceMappingRef.current));
        try { localStorage.setItem('poca_price_mapping_backup', JSON.stringify(priceMappingRef.current)); } catch (e) {}

        try {
            await supabase.from('price').upsert({ id: originalPrice, id_c: val });
        } catch (e) {
            console.error("儲存至 price 表失敗", e);
        }

        if (missingPriceResolver.current) missingPriceResolver.current(val);
        setMissingPriceCard(null);
        setManualPriceInput('');
    };

    const [selectedPocaId, setSelectedPocaId] = useState(null);
    const [selectedLocalId, setSelectedLocalId] = useState(null);
    const [overwriteImage, setOverwriteImage] = useState(true);
    const [pocaPage, setPocaPage] = useState(1);
    const [showNoImageOnly, setShowNoImageOnly] = useState(false);
    const [hideMatched, setHideMatched] = useState(false);
    const POCA_PER_PAGE = 100;

    const [filterSubunits, setFilterSubunits] = useState<any[]>([]);
    const [filterMembers, setFilterMembers] = useState<any[]>([]);
    const [filterSubMembers, setFilterSubMembers] = useState<any[]>([]);
    const [filterTypes, setFilterTypes] = useState<any[]>([]);
    const [filterChannels, setFilterChannels] = useState<any[]>([]);
    const [showSeriesModal, setShowSeriesModal] = useState(false);
    const [filterSeriesType, setFilterSeriesType] = useState('All');
    const [filterSeries, setFilterSeries] = useState<any[]>([]);
    const [filterBatches, setFilterBatches] = useState<any[]>([]);

    useEffect(() => {
        setFilterSubMembers([]);
    }, [filterMembers]);

    // 切換團體時，清空所有篩選條件，避免殘留無效的選取
    useEffect(() => {
        setFilterSubunits([]); setFilterMembers([]); setFilterSubMembers([]);
        setFilterTypes([]); setFilterChannels([]); setFilterSeriesType('All');
        setFilterSeries([]); setFilterBatches([]); setPocaPage(1);
    }, [currentGroupId]);

    const seriesMap = useMemo(() => {
        const map = {};
        (series || []).forEach(s => map[String(s.id)] = s);
        return map;
    }, [series]);

    const batchMap = useMemo(() => {
        const map = {};
        (batches || []).forEach(b => map[String(b.id)] = b);
        return map;
    }, [batches]);

    const memberMap = useMemo(() => {
        const map = {};
        (members || []).forEach(m => map[String(m.id)] = m);
        return map;
    }, [members]);

    const typeMap = useMemo(() => {
        const map = {};
        (types || []).forEach(t => { map[String(t.id)] = t; map[String(t.name)] = t; });
        return map;
    }, [types]);

    const channelMap = useMemo(() => {
        const map = {};
        (channels || []).forEach(c => { map[String(c.id)] = c; map[String(c.name)] = c; });
        return map;
    }, [channels]);

    // 🌟 判斷資料庫小卡是否已對照，直接以卡片資料庫中的 poco_id 欄位為主
    const baseCards = currentCards;

    const availableSubunits = useMemo(() => {
        const usedNames = new Set();
        baseCards.forEach(c => {
            const m = memberMap[String(c.memberId)];
            const s = seriesMap[String(c.seriesId)];
            if (m && m.subunit) usedNames.add(m.subunit);
            if (s && s.subunit) usedNames.add(s.subunit);
        });

        const subunitSortMap = new Map();
        (currentSubunitsAll || []).forEach(s => {
            const current = subunitSortMap.get(s.name);
            if (current === undefined || (s.sortOrder !== undefined && s.sortOrder < current)) {
                subunitSortMap.set(s.name, s.sortOrder ?? 999);
            }
        });

        return Array.from(usedNames).map(name => ({
            id: name,
            name: name,
            sortOrder: subunitSortMap.has(name) ? subunitSortMap.get(name) : 999
        })).sort((a, b) => a.sortOrder - b.sortOrder);
    }, [baseCards, memberMap, seriesMap, currentSubunitsAll]);

    useEffect(() => {
        if (availableSubunits.length > 0) {
            const availableIds = availableSubunits.map(s => s.id);
            setFilterSubunits(prev => prev.filter(id => availableIds.includes(id)));
        } else {
            setFilterSubunits([]);
        }
    }, [availableSubunits]);

    const subunitFilteredCards = useMemo(() => {
        if (filterSubunits.length === 0) return baseCards;
        return baseCards.filter(c => {
            const m = memberMap[String(c.memberId)];
            const s = seriesMap[String(c.seriesId)];
            return (m && filterSubunits.includes(m.subunit)) || (s && filterSubunits.includes(s.subunit));
        });
    }, [baseCards, filterSubunits, memberMap, seriesMap]);

    const availableMembers = useMemo(() => {
        const ids = new Set(subunitFilteredCards.map(c => String(c.memberId)));
        const mems = (currentMembers || []).filter(m => ids.has(String(m.id)));
        if (ids.has('null')) mems.push({ id: 'null', name: '無成員', sortOrder: -1 });
        return mems.sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0));
    }, [subunitFilteredCards, currentMembers]);

    const availableTypes = useMemo(() => {
        const ids = new Set(subunitFilteredCards.map(c => String(c.type)).filter(Boolean));
        const currentTypesList = (currentTypesAll || []).filter(t => ids.has(String(t.id)) || ids.has(String(t.name)));
        ids.forEach(id => {
            if (!currentTypesList.some(t => String(t.id) === id || String(t.name) === id)) {
                currentTypesList.push({ id, name: id === 'null' ? '未分類' : id, shortName: '', sortOrder: 999 });
            }
        });
        return currentTypesList.sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0));
    }, [subunitFilteredCards, currentTypesAll]);

    const availableChannels = useMemo(() => {
        const ids = new Set(subunitFilteredCards.map(c => String(c.channel)).filter(Boolean));
        const currentChannelsList = (channels || []).filter(c => ids.has(String(c.id)) || ids.has(String(c.name)));
        ids.forEach(id => {
            if (!currentChannelsList.some(c => String(c.id) === String(id) || String(c.name) === id)) currentChannelsList.push({ id, name: id === 'null' ? '未分類' : id, shortName: '' });
        });
        const freqMap = {};
        subunitFilteredCards.forEach(c => {
            const effChannel = (!c.channel || c.channel === 'null' || c.channel === 'undefined') ? 'null' : String(c.channel);
            if (effChannel !== 'null') freqMap[effChannel] = (freqMap[effChannel] || 0) + 1;
        });
        return currentChannelsList.sort((a, b) => (freqMap[String(b.id)] || freqMap[String(b.name)] || 0) - (freqMap[String(a.id)] || freqMap[String(a.name)] || 0));
    }, [subunitFilteredCards, channels]);

    const availableSeriesTypes = useMemo(() => {
        const ids = new Set(baseCards.map(c => String(c.seriesId)));
        return [...new Set((currentSeriesAll || []).filter(s => ids.has(String(s.id))).map(s => s.type).filter(Boolean))];
    }, [baseCards, currentSeriesAll]);

    const availableSeriesList = useMemo(() => {
        let filtered = (currentSeriesAll || []).filter(s => baseCards.some(c => String(c.seriesId) === String(s.id)));
        if (filterSubunits.length > 0) {
            filtered = filtered.filter(s => filterSubunits.includes(s.subunit));
        }
        if (filterSeriesType !== 'All') {
            filtered = filtered.filter(s => s.type === filterSeriesType);
        }
        return filtered.sort((a, b) => {
            const parseTime = (d) => {
                if (!d || d === 'null' || d === 'undefined') return 253402214400000;
                const t = new Date(d).getTime();
                return isNaN(t) ? 253402214400000 : t;
            };
            const timeDiff = parseTime(b.date) - parseTime(a.date);
            if (timeDiff !== 0) return timeDiff;
            return Number(b.id) - Number(a.id);
        });
    }, [baseCards, currentSeriesAll, filterSeriesType, filterSubunits]);

    const availableBatchesList = useMemo(() => {
        let filtered = (currentBatchesAll || []).filter(b => baseCards.some(c => String(c.batchId) === String(b.id)));
        if (filterSubunits.length > 0) {
            const validSeriesIds = new Set((currentSeriesAll || []).filter(s => filterSubunits.includes(s.subunit)).map(s => String(s.id)));
            filtered = filtered.filter(b => validSeriesIds.has(String(b.seriesId)));
        }
        if (filterSeries.length > 0) {
            filtered = filtered.filter(b => filterSeries.includes(String(b.seriesId)));
        }
        return filtered.sort((a, b) => {
            const parseTime = (d) => {
                if (!d || d === 'null' || d === 'undefined') return 253402214400000;
                const t = new Date(d).getTime();
                return isNaN(t) ? 253402214400000 : t;
            };
            const timeDiff = parseTime(b.date) - parseTime(a.date);
            if (timeDiff !== 0) return timeDiff;
            return Number(b.id) - Number(a.id);
        });
    }, [baseCards, currentBatchesAll, filterSeries, filterSubunits, currentSeriesAll]);

    useEffect(() => {
        if (filterSeries.length > 0) {
            const validSeries = filterSeries.filter(id => {
                const s = seriesMap[id];
                return s && (filterSeriesType === 'All' || s.type === filterSeriesType);
            });
            if (validSeries.length !== filterSeries.length) {
                setFilterSeries(validSeries);
            }
        }
        if (filterBatches.length > 0) {
            const validBatches = filterBatches.filter(id => {
                const b = batchMap[id];
                if (!b) return false;
                if (filterSeries.length > 0 && !filterSeries.includes(String(b.seriesId))) return false;
                const s = seriesMap[String(b.seriesId)];
                if (s && filterSeriesType !== 'All' && s.type !== filterSeriesType) return false;
                return true;
            });
            if (validBatches.length !== filterBatches.length) {
                setFilterBatches(validBatches);
            }
        }
    }, [filterSeries, filterSeriesType, filterBatches, seriesMap, batchMap]);

    const getSeriesSummary = () => {
        const parts = [];
        if (filterSeriesType !== 'All') parts.push(filterSeriesType);
        if (filterSeries.length > 0) {
            if (filterSeries.length === 1) {
                parts.push(seriesMap[filterSeries[0]]?.name);
            } else {
                parts.push(`已選 ${filterSeries.length} 系列`);
            }
        }
        if (filterBatches.length > 0) {
            if (filterBatches.length === 1) {
                parts.push(batchMap[filterBatches[0]]?.name);
            } else {
                parts.push(`已選 ${filterBatches.length} 批次`);
            }
        }

        return parts.length > 0 ? parts.join(' · ') : '全部系列';
    };

    const RenderFilterSection = ({ label, options, current, onChange, mapName }) => (
        <div className="flex items-center gap-3 overflow-hidden">
            <span className="text-[10px] font-bold text-gray-400 whitespace-nowrap min-w-fit">{label}</span>
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 flex-1">
                {(options || []).map(opt => {
                    const id = typeof opt === 'object' ? opt.id : opt;
                    const name = mapName ? mapName(opt) : (typeof opt === 'object' ? opt.name : opt);
                    const isSelected = current.includes(String(id));
                    return (
                        <button
                            key={id}
                            onClick={() => onChange(String(id))}
                            className={`px-3 py-1 text-xs rounded-full whitespace-nowrap border select-none transition-all ${isSelected ? 'bg-indigo-600 border-indigo-600 text-white font-bold' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'}`}
                        >
                            {name}
                        </button>
                    );
                })}
            </div>
        </div>
    );

    const toggleFilter = (setFunc, val) => {
        setFunc(prev => prev.includes(val) ? prev.filter(x => x !== val) : [...prev, val]);
    };

    const filteredLocalCards = useMemo(() => {
        const list = baseCards.filter(card => {
            const hasImage = card.image && String(card.image).trim() !== '' && card.image !== 'null' && card.image !== 'undefined';
            if (hideMatched && (card.poco_id || card.pocoId || card.poco_jd || card.pocoJd || card.pocaCard || card.PocaCard || card.poca_id)) return false;
            if (showNoImageOnly && hasImage) return false;

            if (filterSubunits.length > 0 && filterMembers.length === 0) {
                const mem = memberMap[String(card.memberId)];
                const ser = seriesMap[String(card.seriesId)];
                const belongsToSubunit = (mem && filterSubunits.includes(mem.subunit)) || (ser && filterSubunits.includes(ser.subunit));
                if (!belongsToSubunit) return false;
            }

            if (filterMembers.length > 0) {
                if (!filterMembers.includes(String(card.memberId))) return false;
                const isGroup = filterMembers.some(id => memberMap[id] && (memberMap[id].name.includes('그룹') || memberMap[id].name.includes('團體') || memberMap[id].name.toLowerCase().includes('group')));
                if (isGroup && filterSubMembers.length > 0) {
                    const cardSubMembers = card.memberId2 || [];
                    if (cardSubMembers.length === 0) return false;
                    const hasMatchingMember = filterSubMembers.some(id => cardSubMembers.includes(String(id)));
                    if (!hasMatchingMember) return false;
                }
            }
            if (filterSeries.length > 0 && !filterSeries.includes(String(card.seriesId))) return false;

            if (filterSeriesType !== 'All' && filterSeries.length === 0) {
                const s = seriesMap[String(card.seriesId)];
                if (!s || s.type !== filterSeriesType) return false;
            }

            if (filterTypes.length > 0) {
                const typeValue = (!card.type || card.type === 'null' || card.type === 'undefined') ? 'null' : String(card.type);
                const typeObj = typeMap[typeValue];
                const cardTypeMatches = typeObj ? (filterTypes.includes(String(typeObj.id)) || filterTypes.includes(typeObj.name)) : filterTypes.includes(typeValue);
                if (!cardTypeMatches) return false;
            }

            if (filterChannels.length > 0) {
                const channelValue = (!card.channel || card.channel === 'null' || card.channel === 'undefined') ? 'null' : String(card.channel);
                const channelObj = channelMap[channelValue];
                const cardChannelMatches = channelObj ? (filterChannels.includes(String(channelObj.id)) || filterChannels.includes(channelObj.name)) : filterChannels.includes(channelValue);
                if (!cardChannelMatches) return false;
            }
            if (filterBatches.length > 0 && !filterBatches.includes(String(card.batchId))) return false;

            return true;
        });

        list.sort((cardA, cardB) => {
            const safeString = (val) => val ? String(val) : '';
            const safeNum = (val, defaultVal) => { const n = Number(val); return isNaN(n) ? defaultVal : n; };

            const hasBatchA = !!cardA.batchId;
            const hasBatchB = !!cardB.batchId;

            if (hasBatchA !== hasBatchB) return hasBatchA ? -1 : 1;

            const sA = seriesMap[String(cardA.seriesId)];
            const sB = seriesMap[String(cardB.seriesId)];
            const parseTime = (d) => {
                if (!d || d === 'null' || d === 'undefined') return 253402214400000;
                const t = new Date(d).getTime();
                return isNaN(t) ? 253402214400000 : t;
            };

            const dateA_series = parseTime(sA?.date);
            const dateB_series = parseTime(sB?.date);

            if (!hasBatchA && !hasBatchB) {
                if (dateA_series !== dateB_series) return dateA_series - dateB_series;
                const nameCompare = safeString(cardA.name).localeCompare(safeString(cardB.name), 'zh-TW', { numeric: true });
                if (nameCompare !== 0) return nameCompare;
                const mA = memberMap[String(cardA.memberId)];
                const mB = memberMap[String(cardB.memberId)];
                const mSortA = mA ? safeNum(mA.sortOrder, 999) : 999;
                const mSortB = mB ? safeNum(mB.sortOrder, 999) : 999;
                if (mSortA !== mSortB) return mSortA - mSortB;
                return safeString(cardA.id).localeCompare(safeString(cardB.id));
            }

            if (dateA_series !== dateB_series) return dateA_series - dateB_series;

            const tA = typeMap[String(cardA.type)];
            const tB = typeMap[String(cardB.type)];
            const sortA_type = tA ? safeNum(tA.sortOrder, 999) : 999;
            const sortB_type = tB ? safeNum(tB.sortOrder, 999) : 999;
            if (sortA_type !== sortB_type) return sortA_type - sortB_type;

            const bA = batchMap[String(cardA.batchId)];
            const bB = batchMap[String(cardB.batchId)];
            const dateA_batch = parseTime(bA?.date);
            const dateB_batch = parseTime(bB?.date);
            if (dateA_batch !== dateB_batch) return dateA_batch - dateB_batch;

            const nameA = safeString(bA?.name);
            const nameB = safeString(bB?.name);
            const nameCompare = nameA.localeCompare(nameB, 'zh-TW', { numeric: true });
            if (nameCompare !== 0) return nameCompare;

            const mA = memberMap[String(cardA.memberId)];
            const mB = memberMap[String(cardB.memberId)];
            const mSortA = mA ? safeNum(mA.sortOrder, 999) : 999;
            const mSortB = mB ? safeNum(mB.sortOrder, 999) : 999;
            if (mSortA !== mSortB) return mSortA - mSortB;

            return safeString(cardA.id).localeCompare(safeString(cardB.id));
        });

        return list;
    }, [baseCards, hideMatched, showNoImageOnly, filterSubunits, filterMembers, filterSubMembers, filterSeries, filterSeriesType, filterTypes, filterChannels, filterBatches, memberMap, seriesMap, typeMap, channelMap, batchMap]);

    // 🌟 動態反查：從 ui_cards 蒐集已經對照的 POCA ID（跨所有團體），確保準確過濾
    const matchedPocaIds = useMemo(() => {
        const set = new Set();
        (allCards || cards || []).forEach(c => {
            const pocaId = c.poco_id || c.pocoId || c.poco_jd || c.pocaCard || c.PocaCard || c.poca_id;
            if (pocaId) set.add(String(pocaId));
        });
        return set;
    }, [allCards, cards]);

    // 🌟 排序，讓新抓到的卡片排在最前面 (過濾掉已對照的卡片)
    const unmatchedPoca = useMemo(() => (pocaCards || [])
        .filter(p => !matchedPocaIds.has(String(p.id)) && !p.cardId && !p.card_id)
        .sort((a, b) => Number(b.id) - Number(a.id)), [pocaCards, matchedPocaIds]);

    const totalPocaPages = Math.ceil(unmatchedPoca.length / POCA_PER_PAGE);
    const displayedPocaCards = useMemo(() => {
        const startIndex = (pocaPage - 1) * POCA_PER_PAGE;
        return unmatchedPoca.slice(startIndex, startIndex + POCA_PER_PAGE);
    }, [unmatchedPoca, pocaPage]);

    const handlePocaCrawl = async () => {
        setIsCrawling(true);
        setSyncProgress('準備中...');
        try {
            const initialMapping = {
                2.5: 500, 3.5: 1000, 4.2: 1500, 4.9: 2000, 5.6: 2500,
                6.3: 3000, 7.0: 3500, 8.4: 4000, 9.1: 4500, 9.8: 5000,
                11.9: 6000, 13.3: 7000, 14.7: 8000, 15.4: 8500, 16.1: 9000,
                16.8: 9500, 17.5: 10000, 24.5: 15000, 28.7: 18000, 31.5: 20000,
                32.9: 21000, 38.5: 25000, 52.5: 35000, 59.5: 40000, 105: 70000, 115.5: 80000
            };

            let priceMap = { ...initialMapping };

            const savedMappingStr = (appSettings || []).find(s => s.key === 'poca_price_mapping')?.value;
            if (savedMappingStr) {
                try {
                    const savedMap = JSON.parse(savedMappingStr);
                    priceMap = { ...priceMap, ...savedMap };
                } catch (e) {}
            }

            try {
                const res = await fetch(`/api/data?table=price&_t=${Date.now()}`, { method: 'GET', cache: 'no-store' });
                if (res.ok) {
                    const json = await res.json();
                    if (json && json.data) {
                        json.data.forEach(p => {
                            const orig = Number(p.id);
                            const conv = p.id_c !== undefined && p.id_c !== null ? Number(p.id_c) : (p.idC !== undefined && p.idC !== null ? Number(p.idC) : NaN);
                            if (!isNaN(orig) && !isNaN(conv)) {
                                if (orig > conv) priceMap[conv] = orig;
                                else priceMap[orig] = conv;
                            }
                        });
                    }
                } else {
                    throw new Error(`Fetch failed: ${res.status}`);
                }
            } catch (e) {
                console.warn("即時讀取 price 表失敗，改用預設與快取", e);
                if (prices && prices.length > 0) {
                    prices.forEach(p => {
                        const orig = Number(p.id);
                        const conv = p.id_c !== undefined ? Number(p.id_c) : Number((p as any).idC);
                        if (!isNaN(orig) && !isNaN(conv)) {
                            if (orig > conv) priceMap[conv] = orig;
                            else priceMap[orig] = conv;
                        }
                    });
                }
            }

            try {
                const localBackup = localStorage.getItem('poca_price_mapping_backup');
                if (localBackup) {
                    const parsed = JSON.parse(localBackup);
                    if (Array.isArray(parsed)) {
                        parsed.forEach((p: any) => {
                            const orig = Number(p.id);
                            const conv = p.id_c !== undefined ? Number(p.id_c) : Number(p.idC);
                            if (!isNaN(orig) && !isNaN(conv)) {
                                if (orig > conv) priceMap[conv] = orig;
                                else priceMap[orig] = conv;
                            }
                        });
                    } else {
                        Object.keys(parsed).forEach(k => {
                            const orig = Number(k);
                            const conv = Number(parsed[k]);
                            if (!isNaN(orig) && !isNaN(conv)) {
                                if (orig > conv) priceMap[conv] = orig;
                                else priceMap[orig] = conv;
                            }
                        });
                    }
                }
            } catch (e) {}

            priceMappingRef.current = priceMap;

            let page = 1;
            let hasNext = true;
            let allFetchedPocas: any[] = [];

            while (hasNext) {
                const promises = [];
                for (let i = 0; i < 5; i++) {
                    const targetUrl = `https://pocamarket.com/apis/card/gb/v2/search?group=36&price_step=ALL&sort=new&page=${page + i}`;
                    promises.push(
                        fetch(`/api/proxy-json?url=${encodeURIComponent(targetUrl)}`)
                            .then(async (res) => {
                                if (!res) return null;
                                if (res.ok) return res.json();
                                const errText = await res.text();
                                if (res.status === 404 || errText.includes('404')) {
                                    return { success: true, data: { results: [] } };
                                }
                                throw new Error(`Proxy 錯誤 ${res.status}: ${errText}`);
                            })
                            .catch(err => {
                                console.warn(`頁面 ${page + i} 抓取失敗:`, err.message);
                                return null;
                            })
                    );
                }
                setSyncProgress(`已抓取 ${allFetchedPocas.length} 筆...`);

                const results = await Promise.all(promises);
                let gotEmptyOrSmallPage = false;

                for (const json of results.filter(Boolean)) {
                    if (json?.success && json.data?.results) {
                        for (const item of json.data.results) {
                            const originalPrice = Number(item.price ?? 0);
                            let finalPrice = priceMappingRef.current[originalPrice];

                            if (finalPrice === undefined) {
                                finalPrice = await new Promise((resolve) => {
                                    setMissingPriceCard({ originalPrice, image: String(item.image || item.imagePath || '') } as any);
                                    missingPriceResolver.current = resolve;
                                });
                                if (finalPrice === null) throw new Error("使用者中斷了同步作業");
                            }

                            allFetchedPocas.push({
                                id: String(item.id),
                                image: String(item.image || item.imagePath || ''),
                                stocked_count: Number(item.stocked_count ?? item.stock_count ?? item.stockCount ?? item.stockedCount ?? item.quantity ?? 0),
                                price: Number(finalPrice)
                            });
                        }

                        if (json.data.results.length === 0) gotEmptyOrSmallPage = true;
                    } else {
                        gotEmptyOrSmallPage = true;
                    }
                }

                if (gotEmptyOrSmallPage || allFetchedPocas.length > 20000) {
                    hasNext = false;
                } else {
                    page += 5;
                }
            }

            setSyncProgress('正在寫入資料庫...');
            const uniquePocasMap = new Map();
            allFetchedPocas.forEach(p => uniquePocasMap.set(p.id, p));
            allFetchedPocas = Array.from(uniquePocasMap.values());

            const matchedIdsNow = new Set();
            (cards || []).forEach(c => {
                const pocaId = c.poco_id || c.pocoId || c.poco_jd || c.pocaCard || c.PocaCard || c.poca_id;
                if (pocaId) matchedIdsNow.add(String(pocaId));
            });

            const allPayloads = allFetchedPocas.map(p => ({
                id: Number(p.id),
                image: p.image || '',
                stocked_count: p.stocked_count !== undefined ? Number(p.stocked_count) : 0,
                price: Number(p.price),
                group_name_en: 'cravity'
            }));

            let dbError = null;
            let successCount = 0;
            const totalToProcess = allPayloads.length;

            const CHUNK_SIZE = 10;
            for (let i = 0; i < allPayloads.length; i += CHUNK_SIZE) {
                const chunk = allPayloads.slice(i, i + CHUNK_SIZE);
                const res = await fetch('/api/poca/upsert', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ items: chunk })
                });
                const result_raw = await res.json();
                const result = result_raw ?? { success: false, error: '無回應 (可能是 405)' };

                if (result?.success) {
                    successCount += result.count ?? chunk.length;
                } else if (!dbError) {
                    dbError = result.error || 'Upsert failed with no error message.';
                }
                setSyncProgress(`寫入資料庫中 ${successCount}/${totalToProcess} 筆...`);

                await new Promise(resolve => setTimeout(resolve, 30));
            }

            const newPocasCamel = allFetchedPocas.map(toCamelCase);
            setPocaCards(prev => {
                const merged = newPocasCamel.map((newP: any) => {
                    const pidStr = String(newP.id);
                    const isMatched = matchedIdsNow.has(pidStr);
                    const finalCardId = isMatched ? Number(newP.id) : null;
                    return {
                        ...newP,
                        price: Number(newP.price),
                        cardId: finalCardId,
                        card_id: finalCardId
                    };
                });

                const fetchedIds = new Set(merged.map((p: any) => String(p.id)));
                const unchanged = prev.filter((p: any) => !fetchedIds.has(String(p.id)));

                return [...unchanged, ...merged];
            });

            setSyncProgress('');
            setIsCrawling(false);

            setTimeout(() => {
                alert(`POCA 資料同步完成！\n共抓取: ${allFetchedPocas.length} 筆\n成功寫入/更新: ${successCount} 筆${dbError ? `\n⚠️ 部分錯誤: ${dbError}` : ''}`);
            }, 500);
        } catch (e: any) {
            setSyncProgress('');
            setIsCrawling(false);
            setTimeout(() => {
                alert('爬蟲失敗: ' + e.message);
            }, 500);
        }
    };

    const handleMatch = async () => {
        if (!selectedPocaId || !selectedLocalId) return;

        try {
            const poca = pocaCards.find(p => String(p.id) === String(selectedPocaId));
            const response = await fetch('/api/sync/poca-bind', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    local_card_id: selectedLocalId,
                    poca_id: selectedPocaId,
                    overwrite_image: overwriteImage,
                    poca_image: poca?.image
                }),
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.error || '伺服器更新失敗');
            }

            setCards(prev => prev.map((c: any) => {
                if (String(c.id) === String(selectedLocalId)) {
                    const updatedCard = { ...c, pocaCard: selectedPocaId, PocaCard: selectedPocaId, poco_id: selectedPocaId, pocoId: selectedPocaId, pocoJd: selectedPocaId, poco_jd: selectedPocaId };
                    if (overwriteImage) {
                        const p = pocaCards.find(pc => String(pc.id) === String(selectedPocaId));
                        if (p && p.image) {
                            updatedCard.image = p.image;
                        }
                    }
                    return updatedCard;
                }
                return c;
            }));
            setAllCards(prev => prev.map((c: any) => {
                if (String(c.id) === String(selectedLocalId)) {
                    const updatedCard = { ...c, pocaCard: selectedPocaId, PocaCard: selectedPocaId, poco_id: selectedPocaId, pocoId: selectedPocaId, pocoJd: selectedPocaId, poco_jd: selectedPocaId };
                    if (overwriteImage) {
                        const p = pocaCards.find(pc => String(pc.id) === String(selectedPocaId));
                        if (p && p.image) updatedCard.image = p.image;
                    }
                    return updatedCard;
                }
                return c;
            }));

            setPocaCards(prev => prev.map((p: any) =>
                String(p.id) === String(selectedPocaId) ? { ...p, cardId: Number(selectedPocaId), card_id: Number(selectedPocaId) } : p
            ));

            setSelectedPocaId(null);
            setSelectedLocalId(null);

            if (displayedPocaCards.length === 1 && pocaPage > 1) {
                setPocaPage(pocaPage - 1);
            }

        } catch (error: any) {
            console.error('對照失敗:', error);
            alert('對照失敗: ' + error.message);
        }
    };

    if (loading) {
        return <div className="p-8 text-center text-gray-500">資料載入中...</div>;
    }

    if (!groups.length) {
        return <div className="p-8 text-center text-gray-500">尚未建立任何團體，請先於前台建立一個團體。</div>;
    }

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="bg-white border-b border-gray-200 sticky top-0 z-30">
                <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                        <Link href="/admin" className="p-2 -ml-2 rounded-full hover:bg-gray-100 transition-colors flex-shrink-0">
                            <ArrowLeft className="w-5 h-5 text-gray-600" />
                        </Link>
                        <div className="min-w-0">
                            <h1 className="text-lg font-bold text-gray-800 truncate">資料同步</h1>
                            <p className="text-xs text-gray-400">POCA 卡片對照與批次抓取</p>
                        </div>
                    </div>
                    {groups.length > 1 && (
                        <select
                            value={currentGroupId ?? ''}
                            onChange={(e) => setCurrentGroupId(e.target.value)}
                            className="text-sm font-bold border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 flex-shrink-0"
                        >
                            {groups.map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}
                        </select>
                    )}
                </div>
            </div>

            <main className="max-w-7xl mx-auto">
                <div className="space-y-4 pb-24">
                    <div className="px-4 pt-4">
                        <div className="flex space-x-1 overflow-x-auto no-scrollbar bg-gray-100 p-1 rounded-full w-fit">
                            <button onClick={() => setActiveSubTab('crawler')} className={`px-4 py-2 rounded-full text-sm font-bold transition-all ${activeSubTab === 'crawler' ? 'bg-white shadow text-black' : 'text-gray-500'}`}>批次抓取設定</button>
                            <button onClick={() => setActiveSubTab('poca_match')} className={`px-4 py-2 rounded-full text-sm font-bold transition-all ${activeSubTab === 'poca_match' ? 'bg-white shadow text-black' : 'text-gray-500'}`}>POCA對照設定</button>
                        </div>
                    </div>

                    {activeSubTab === 'poca_match' && (
                        <div className="flex flex-col md:flex-row gap-4 px-4 h-[85vh]">
                            <div className="flex-1 min-w-0 bg-white border border-gray-200 rounded-xl shadow-sm flex flex-col overflow-hidden">
                                <div className="p-3 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                                    <h3 className="font-bold text-gray-800 text-sm">未對照 POCA 卡片 ({unmatchedPoca.length})</h3>
                                    <button onClick={handlePocaCrawl} disabled={isCrawling} className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1">
                                        <RefreshCw className={`w-3 h-3 ${isCrawling ? 'animate-spin' : ''}`} /> {isCrawling ? syncProgress || '同步中...' : '同步'}
                                    </button>
                                </div>
                                <div className="flex-1 overflow-y-auto p-3 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 content-start">
                                    {displayedPocaCards.map((p: any) => (
                                        <div key={p.id} onClick={() => setSelectedPocaId(p.id === selectedPocaId ? null : p.id)} className={`cursor-pointer group relative select-none ${selectedPocaId === p.id ? 'scale-95' : ''}`}>
                                            <div className={`aspect-[2/3] rounded-lg bg-gray-100 overflow-hidden relative shadow-sm border transition-all ${selectedPocaId === p.id ? 'border-indigo-600 ring-2 ring-indigo-600' : 'border-gray-200 hover:border-indigo-300'}`}>
                                                <img src={p.image} className="absolute inset-0 w-full h-full object-cover" />
                                                <div className="absolute bottom-0 inset-x-0 bg-black/60 p-1">
                                                    <div className="text-[9px] text-white font-bold truncate">{p.id}</div>
                                                    <div className="text-[9px] text-green-300 font-bold">${(!isNaN(Number(p.price)) && Number(p.price) > 100) ? Number(p.price) : Number(p.idC ?? p.id_c ?? p.price ?? 0)}</div>
                                                </div>
                                            </div>
                                            {selectedPocaId === p.id && <div className="absolute top-1 right-1 bg-indigo-600 rounded-full w-4 h-4 flex items-center justify-center shadow z-10"><Check className="w-3 h-3 text-white" /></div>}
                                        </div>
                                    ))}
                                    {displayedPocaCards.length === 0 && (
                                        <div className="col-span-full text-center text-gray-400 text-sm py-10">目前沒有未對照的 POCA 卡片，點擊「同步」抓取最新資料。</div>
                                    )}
                                </div>
                                {totalPocaPages > 1 && (
                                    <div className="p-2 border-t border-gray-100 flex justify-center items-center gap-4 flex-shrink-0">
                                        <button
                                            onClick={() => setPocaPage(p => Math.max(1, p - 1))}
                                            disabled={pocaPage === 1}
                                            className="p-2 rounded-full hover:bg-gray-100 disabled:opacity-50"
                                        >
                                            <ChevronLeft className="w-5 h-5" />
                                        </button>
                                        <span className="text-xs font-bold text-gray-600">第 {pocaPage} / {totalPocaPages} 頁</span>
                                        <button
                                            onClick={() => setPocaPage(p => Math.min(totalPocaPages, p + 1))}
                                            disabled={pocaPage === totalPocaPages}
                                            className="p-2 rounded-full hover:bg-gray-100 disabled:opacity-50"
                                        >
                                            <ChevronRight className="w-5 h-5" />
                                        </button>
                                    </div>
                                )}
                            </div>

                            <div className="md:hidden flex flex-col items-center gap-3 justify-center flex-shrink-0">
                                <div className="flex items-center gap-2 bg-white p-2 rounded-full shadow-lg">
                                    <input type="checkbox" id="overwriteImageMobile" checked={overwriteImage} onChange={(e) => setOverwriteImage(e.target.checked)} className="w-4 h-4 text-indigo-600 rounded cursor-pointer" />
                                    <label htmlFor="overwriteImageMobile" className="text-xs font-bold text-gray-700 cursor-pointer select-none">覆蓋圖片</label>
                                </div>
                                <button onClick={handleMatch} disabled={!selectedPocaId || !selectedLocalId} className="bg-black text-white px-8 py-3 rounded-full font-bold shadow-lg disabled:opacity-50">確認對照</button>
                            </div>

                            <div className="flex-[1.5] min-w-0 bg-white border border-gray-200 rounded-xl shadow-sm flex flex-col overflow-hidden relative">
                                <div className="p-3 border-b border-gray-100 space-y-3 bg-gray-50 flex-shrink-0">
                                    <div className="flex justify-between items-center">
                                        <h3 className="font-bold text-gray-800 text-sm">資料庫小卡 ({filteredLocalCards.length})</h3>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => setShowNoImageOnly(!showNoImageOnly)}
                                                className={`px-2 py-1 text-[10px] font-bold rounded-md transition-colors ${showNoImageOnly ? 'bg-indigo-100 text-indigo-700' : 'bg-white border text-gray-500 hover:bg-gray-50'}`}
                                            >
                                                只看無圖
                                            </button>
                                            <button
                                                onClick={() => setHideMatched(!hideMatched)}
                                                className={`px-2 py-1 text-[10px] font-bold rounded-md transition-colors ${hideMatched ? 'bg-green-100 text-green-700' : 'bg-white border text-gray-500 hover:bg-gray-50'}`}
                                            >
                                                隱藏已對照
                                            </button>
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        {availableSubunits.length > 0 && <RenderFilterSection label="分隊" options={availableSubunits} current={filterSubunits} onChange={(val) => toggleFilter(setFilterSubunits, val)} mapName={s => s.name} />}
                                        {availableMembers.length > 0 && <RenderFilterSection label="成員" options={availableMembers} current={filterMembers} onChange={(val) => toggleFilter(setFilterMembers, val)} mapName={m => m.name} />}
                                        {filterMembers.some(id => memberMap[id] && (memberMap[id].name.includes('그룹') || memberMap[id].name.includes('團體') || memberMap[id].name.toLowerCase().includes('group'))) && (currentMembers || []).length > 0 && (
                                            <RenderFilterSection label="包含成員" options={(currentMembers || []).filter((m: any) => filterSubunits.length === 0 || filterSubunits.includes(m.subunit)).sort((a: any, b: any) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0))} current={filterSubMembers} onChange={(val) => toggleFilter(setFilterSubMembers, val)} mapName={m => m.name} />
                                        )}
                                        {availableTypes.length > 0 && <RenderFilterSection label="子類" options={availableTypes} current={filterTypes} onChange={(val) => toggleFilter(setFilterTypes, val)} mapName={t => t.name} />}
                                        {availableChannels.length > 0 && <RenderFilterSection label="通路" options={availableChannels} current={filterChannels} onChange={(val) => toggleFilter(setFilterChannels, val)} mapName={c => c.name} />}
                                        <div onClick={() => setShowSeriesModal(true)} className="flex items-center justify-between p-2 bg-white rounded-lg border border-gray-200 cursor-pointer hover:border-indigo-300 transition-all group">
                                            <div className="flex items-center gap-2 overflow-hidden">
                                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">系列與版本</span>
                                                <div className="h-4 w-px bg-gray-300 mx-1"></div>
                                                <span className={`text-xs truncate font-medium ${getSeriesSummary() !== '全部系列' ? 'text-indigo-600' : 'text-gray-600'}`}>{getSeriesSummary()}</span>
                                            </div>
                                            <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-indigo-500" />
                                        </div>
                                    </div>
                                </div>
                                <div className="flex-1 overflow-y-auto p-3 grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 content-start pb-20">
                                    {filteredLocalCards.map((c: any) => {
                                        const cardSeries = seriesMap[String(c.seriesId)];
                                        const seriesName = cardSeries?.shortName || cardSeries?.name;
                                        const cardBatch = batchMap[String(c.batchId)];
                                        const effectiveType = (!c.type || c.type === 'null' || c.type === 'undefined') ? null : c.type;
                                        const typeObj = typeMap[String(effectiveType)];
                                        const displayType = typeObj ? (typeObj.shortName || typeObj.name) : effectiveType;
                                        const effectiveChannelId = (!c.channel || c.channel === 'null' || c.channel === 'undefined') ? null : c.channel;
                                        const channelObj = channelMap[String(effectiveChannelId)];
                                        const displayChannel = channelObj ? (channelObj.shortName || channelObj.name) : effectiveChannelId;
                                        const batchNumber = cardBatch?.batchNumber && cardBatch.batchNumber !== 'null' && cardBatch.batchNumber !== 'undefined' ? cardBatch.batchNumber : null;
                                        const channelAndBatch = [displayChannel, batchNumber].filter(Boolean).join('');
                                        const displayTitle = [seriesName, channelAndBatch, displayType].filter(Boolean).join(' ');

                                        const hasImage = c.image && String(c.image).trim() !== '' && c.image !== 'null' && c.image !== 'undefined';

                                        return (
                                            <div key={c.id} onClick={() => setSelectedLocalId(c.id === selectedLocalId ? null : c.id)} className={`cursor-pointer group relative select-none ${selectedLocalId === c.id ? 'scale-95' : ''}`}>
                                                <div className={`aspect-[2/3] rounded-lg bg-gray-100 overflow-hidden relative shadow-sm border transition-all ${selectedLocalId === c.id ? 'border-pink-500 ring-2 ring-pink-500' : 'border-gray-200 hover:border-pink-300'}`}>
                                                    {hasImage ? <img src={c.image} className="absolute inset-0 w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><ImageIcon className="w-6 h-6 text-gray-300" /></div>}
                                                    {(c.pocoId || c.poco_id || c.pocoJd || c.poco_jd || c.pocaCard || c.PocaCard || c.poca_id) && <div className="absolute top-1 left-1 bg-green-500 text-white text-[8px] px-1 rounded font-bold shadow z-10">已對照</div>}
                                                    {selectedLocalId === c.id && <div className="absolute top-1 right-1 bg-pink-500 rounded-full w-4 h-4 flex items-center justify-center shadow z-10"><Check className="w-3 h-3 text-white" /></div>}
                                                </div>
                                                <div className="px-1 pt-1">
                                                    <div className="text-[9px] font-bold text-gray-800 leading-tight line-clamp-2">{displayTitle || '未命名卡片'}</div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                    {filteredLocalCards.length === 0 && (
                                        <div className="col-span-full text-center text-gray-400 text-sm py-10">沒有符合篩選條件的卡片。</div>
                                    )}
                                </div>

                                <div className="hidden md:flex absolute bottom-4 inset-x-0 justify-center pointer-events-none">
                                    <div className="flex items-center gap-4">
                                        <button onClick={handleMatch} disabled={!selectedPocaId || !selectedLocalId} className="bg-black text-white px-8 py-3 rounded-full font-bold shadow-[0_8px_30px_rgb(0,0,0,0.2)] disabled:opacity-50 pointer-events-auto flex items-center gap-2 hover:bg-gray-800 transition-colors"><ArrowLeft className="w-4 h-4" /> 確認對照</button>
                                        <div className="flex items-center gap-2 bg-white p-2 rounded-full shadow-lg pointer-events-auto">
                                            <input type="checkbox" id="overwriteImage" checked={overwriteImage} onChange={(e) => setOverwriteImage(e.target.checked)} className="w-4 h-4 text-indigo-600 rounded cursor-pointer" />
                                            <label htmlFor="overwriteImage" className="text-xs font-bold text-gray-700 cursor-pointer select-none">覆蓋圖片</label>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeSubTab === 'crawler' && (
                        <div className="bg-white border rounded-xl p-6 shadow-sm text-center flex flex-col items-center mx-4">
                            <h2 className="text-xl font-bold text-gray-800 mb-2">批次抓取設定</h2>
                            <p className="text-gray-500 mb-6">執行同步程式以抓取最新 POCA 卡片與對照最新卡價。</p>
                            <button onClick={handlePocaCrawl} disabled={isCrawling} className="bg-indigo-600 text-white px-6 py-3 rounded-full font-bold shadow-lg hover:bg-indigo-700 disabled:opacity-50">
                                {isCrawling ? syncProgress || '同步中...' : '執行資料同步'}
                            </button>
                        </div>
                    )}

                    {missingPriceCard && (
                        <Modal
                            title="發現未知卡價"
                            onClose={() => {
                                if (confirm("確定要中斷目前的同步進度嗎？")) {
                                    if (missingPriceResolver.current) (missingPriceResolver.current as any)(null);
                                    setMissingPriceCard(null);
                                }
                            }}
                            className="max-w-sm"
                            footer={<button onClick={handleMissingPriceSubmit} className="w-full py-3 rounded-xl bg-black text-white font-bold shadow-lg">確認並繼續</button>}
                        >
                            <div className="flex flex-col items-center gap-4 p-4 text-center">
                                <div className="text-gray-500 text-sm">此 POCA 卡片的價格不在對照表中，請手動輸入轉換後的價格：</div>
                                <div className="w-32 aspect-[2/3] rounded-lg overflow-hidden border shadow-sm relative bg-gray-100">
                                    {(missingPriceCard as any).image ? <img src={(missingPriceCard as any).image} className="absolute inset-0 w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><ImageIcon className="w-6 h-6 text-gray-300" /></div>}
                                </div>
                                <div className="font-bold text-red-500 text-lg">原始價格 (美金): {(missingPriceCard as any).originalPrice}</div>
                                <div className="w-full">
                                    <label className="text-xs font-bold text-gray-500 mb-1 block text-left">對照後價格 (韓幣)</label>
                                    <input
                                        autoFocus type="number" step="0.1" placeholder="例如: 500"
                                        value={manualPriceInput} onChange={(e) => setManualPriceInput(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleMissingPriceSubmit()}
                                        className="w-full border p-3 rounded-xl bg-gray-50 focus:bg-white outline-none focus:ring-2 focus:ring-indigo-100 font-bold"
                                    />
                                </div>
                            </div>
                        </Modal>
                    )}

                    <SeriesFilterModal
                        visible={showSeriesModal} onClose={() => setShowSeriesModal(false)}
                        seriesTypes={availableSeriesTypes}
                        selectedSeriesType={filterSeriesType}
                        setSeriesType={(val) => {
                            setFilterSeriesType(val);
                            if (val === 'All') { setFilterSeries([]); setFilterBatches([]); }
                        }}
                        series={availableSeriesList}
                        selectedSeries={filterSeries}
                        setSeries={setFilterSeries}
                        batches={availableBatchesList} selectedBatches={filterBatches} setBatches={setFilterBatches}
                    />
                </div>
            </main>
        </div>
    );
}
