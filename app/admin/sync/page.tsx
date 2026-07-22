'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { RefreshCw, Check, ChevronLeft, ChevronRight, ImageIcon, ArrowLeft } from 'lucide-react';
import { supabase } from '@/utils/supabase'; // Assuming you have this file
import { toCamelCase, toSnakeCase } from '@/utils/case'; // Assuming you have these utils

// Mock missing components for now. These will need to be created or imported.
const Modal = ({ title, onClose, children, footer }) => (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl shadow-lg w-full max-w-sm">
            <div className="p-4 border-b flex justify-between items-center">
                <h3 className="font-bold">{title}</h3>
                <button onClick={onClose}>&times;</button>
            </div>
            <div>{children}</div>
            {footer && <div className="p-4 border-t">{footer}</div>}
        </div>
    </div>
);

const SeriesFilterModal = ({ visible, onClose, seriesTypes, selectedSeriesType, setSeriesType, series, selectedSeries, setSeries, batches, selectedBatches, setBatches }) => {
    if (!visible) return null;
    // A proper implementation is needed here
    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
             <div className="bg-white rounded-xl shadow-lg w-full max-w-4xl h-3/4 p-4" onClick={e => e.stopPropagation()}>
                <h2 className="font-bold text-lg mb-4">Filter Series & Batches</h2>
                <p>Implementation needed</p>
            </div>
        </div>
    );
};


export default function SyncPage() {
    // --- State copied from App component ---
    const [groups, setGroups] = useState([]);
    const [currentGroupId, setCurrentGroupId] = useState(null);
    const [members, setMembers] = useState([]);
    const [series, setSeries] = useState([]);
    const [channels, setChannels] = useState([]);
    const [types, setTypes] = useState([]);
    const [batches, setBatches] = useState([]);
    const [cards, setCards] = useState([]);
    const [allCards, setAllCards] = useState([]);
    const [subunits, setSubunits] = useState([]); 
    const [appSettings, setAppSettings] = useState([]);
    const [prices, setPrices] = useState([]);
    const [pocaCards, setPocaCards] = useState([]);
    
    // --- Fetch all data on mount ---
    useEffect(() => {
        async function fetchAllData() {
            const fetchTable = async (t, silent = false, options = {}) => { 
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
                        let errData = {};
                        try { errData = JSON.parse(errText); } catch (e) {}
                        throw new Error(`API request failed: ${response.status} - ${errData.error || errText.substring(0, 100) || 'Unknown server error'}`);
                    }
                    
                    const result = await response.json();
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
                    
                } catch (error) {
                    console.error(`🚨 [${t}] Read failed:`, error.message);
                    if (!silent) alert(`Failed to read ${t}!
Error: ${error.message}`);
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
        }
        fetchAllData();
      }, []);

    const currentGroup = (groups || []).find(g => g.id === currentGroupId);

    // --- Logic from SyncTab ---
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
        if (isNaN(val) || val <= 0) return alert("Please enter a valid conversion price");
        const originalPrice = missingPriceCard.originalPrice;
        priceMappingRef.current[originalPrice] = val;
        handleUpdateAppSetting('poca_price_mapping', JSON.stringify(priceMappingRef.current));
        localStorage.setItem('poca_price_mapping_backup', JSON.stringify(priceMappingRef.current));
        
        try {
            await supabase.from('price').upsert({ id: originalPrice, id_c: val });
        } catch (e) {
            console.error("Failed to save to price table", e);
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

    const [filterSubunits, setFilterSubunits] = useState([]);
    const [filterMembers, setFilterMembers] = useState([]);
    const [filterSubMembers, setFilterSubMembers] = useState([]);
    const [filterTypes, setFilterTypes] = useState([]);
    const [filterChannels, setFilterChannels] = useState([]);
    const [showSeriesModal, setShowSeriesModal] = useState(false);
    const [filterSeriesType, setFilterSeriesType] = useState('All');
    const [filterSeries, setFilterSeries] = useState([]);
    const [filterBatches, setFilterBatches] = useState([]);

    useEffect(() => {
        setFilterSubMembers([]);
    }, [filterMembers]);

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

    const baseCards = cards || [];

    const availableSubunits = useMemo(() => {
        const usedNames = new Set();
        baseCards.forEach(c => {
            const m = memberMap[String(c.memberId)];
            const s = seriesMap[String(c.seriesId)];
            if (m && m.subunit) usedNames.add(m.subunit);
            if (s && s.subunit) usedNames.add(s.subunit);
        });
        
        const subunitSortMap = new Map();
        (subunits || []).forEach(s => {
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
    }, [baseCards, memberMap, seriesMap, subunits]);

    const filteredLocalCards = baseCards; // Simplified for now
    
    const matchedPocaIds = new Set();
    (allCards || cards || []).forEach(c => {
        const pocaId = c.poco_id || c.pocoId || c.poco_jd || c.pocaCard || c.PocaCard || c.poca_id;
        if (pocaId) matchedPocaIds.add(String(pocaId));
    });

    const unmatchedPoca = (pocaCards || []).filter(p => !matchedPocaIds.has(String(p.id)) && !p.cardId && !p.card_id).sort((a, b) => Number(b.id) - Number(a.id));
    const totalPocaPages = Math.ceil(unmatchedPoca.length / POCA_PER_PAGE);
    const displayedPocaCards = useMemo(() => {
        const startIndex = (pocaPage - 1) * POCA_PER_PAGE;
        return unmatchedPoca.slice(startIndex, startIndex + POCA_PER_PAGE);
    }, [unmatchedPoca, pocaPage]);

    const handlePocaCrawl = async () => {
        setIsCrawling(true);
        setSyncProgress('Preparing...');
        try {
            const initialMapping = { 2.5: 500, 3.5: 1000, /* ... and so on */ };
            let priceMap = { ...initialMapping };
            const savedMappingStr = (appSettings || []).find(s => s.key === 'poca_price_mapping')?.value;
            if (savedMappingStr) {
                try { 
                    const savedMap = JSON.parse(savedMappingStr); 
                    priceMap = { ...priceMap, ...savedMap };
                } catch (e) {}
            }
            
            try {
                const res = await fetch(`/api/data?table=price&_t=${Date.now()}`, {
                    method: 'GET', cache: 'no-store'
                });
                if (res.ok) {
                    const json = await res.json();
                    if (json && json.data) {
                        json.data.forEach(p => {
                            const orig = Number(p.id);
                            const conv = p.id_c !== undefined ? Number(p.id_c) : Number(p.idC);
                            if (!isNaN(orig) && !isNaN(conv)) {
                                if (orig > conv) priceMap[conv] = orig;
                                else priceMap[orig] = conv;
                            }
                        });
                    }
                } else { throw new Error(`Fetch failed: ${res.status}`); }
            } catch(e) {
                console.warn("Failed to fetch price table, using defaults and cache", e);
            }

            priceMappingRef.current = priceMap;

            let page = 1;
            let hasNext = true;
            let allFetchedPocas = [];

            while (hasNext) {
                const promises = [];
                for (let i = 0; i < 5; i++) {
                    const targetUrl = `https://pocamarket.com/apis/card/gb/v2/search?group=36&price_step=ALL&sort=new&page=${page + i}`;
                    promises.push(
                        fetch(`/api/proxy-json?url=${encodeURIComponent(targetUrl)}`)
                            .then(res => res.ok ? res.json() : null)
                            .catch(() => null)
                    );
                }
                setSyncProgress(`Fetched ${allFetchedPocas.length} cards...`);

                const results = await Promise.all(promises);
                let gotEmptyOrSmallPage = false;

                for (const json of results.filter(Boolean)) {
                    if (json?.success && json.data?.results) {
                        for (const item of json.data.results) {
                            const originalPrice = Number(item.price ?? 0);
                            let finalPrice = priceMappingRef.current[originalPrice];
                            
                            if (finalPrice === undefined) {
                                finalPrice = await new Promise((resolve) => {
                                    setMissingPriceCard({ originalPrice, image: String(item.image || item.imagePath || '') });
                                    missingPriceResolver.current = resolve;
                                });
                                if (finalPrice === null) throw new Error("User cancelled the sync operation");
                            }

                            allFetchedPocas.push({
                                id: String(item.id),
                                image: String(item.image || item.imagePath || ''),
                                stocked_count: Number(item.stocked_count ?? 0),
                                price: Number(finalPrice)
                            });
                        }
                        if (json.data.results.length === 0) gotEmptyOrSmallPage = true;
                    } else { gotEmptyOrSmallPage = true; }
                }

                if (gotEmptyOrSmallPage || allFetchedPocas.length > 20000) {
                    hasNext = false;
                } else { page += 5; }
            }

            setSyncProgress('Writing to database...');
            const uniquePocasMap = new Map();
            allFetchedPocas.forEach(p => uniquePocasMap.set(p.id, p));
            allFetchedPocas = Array.from(uniquePocasMap.values());

            const matchedPocaIds = new Set();
            (cards || []).forEach(c => {
                const pocaId = c.poco_id || c.pocoId;
                if (pocaId) matchedPocaIds.add(String(pocaId));
            });

            const allPayloads = allFetchedPocas.map(p => ({
                id: Number(p.id),
                image: p.image || '',
                stocked_count: Number(p.stocked_count) || 0,
                price: Number(p.price) || 0,
                group_name_en: 'cravity'
            }));

            let dbError = null;
            let successCount = 0;
            const CHUNK_SIZE = 10;
            for (let i = 0; i < allPayloads.length; i += CHUNK_SIZE) {
                const chunk = allPayloads.slice(i, i + CHUNK_SIZE);
                const res = await fetch('/api/poca/upsert', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ items: chunk })
                });
                const result = await res.json();

                if (result?.success) {
                    successCount += result.count ?? chunk.length;
                } else if (!dbError) {
                    dbError = result.error || 'Upsert failed with no error message.';
                }
                setSyncProgress(`Writing to DB ${successCount}/${allPayloads.length}...`);
                await new Promise(resolve => setTimeout(resolve, 30));
            }

            const newPocasCamel = allFetchedPocas.map(toCamelCase);
            setPocaCards(prev => {
                const merged = newPocasCamel.map(newP => ({ ...newP, isMatched: matchedPocaIds.has(String(newP.id)) }));
                const fetchedIds = new Set(merged.map(p => String(p.id)));
                const unchanged = prev.filter(p => !fetchedIds.has(String(p.id)));
                return [...unchanged, ...merged];
            });
            
            setSyncProgress('');
            setIsCrawling(false);
            
            setTimeout(() => {
                alert(`POCA Sync Complete!
Total Fetched: ${allFetchedPocas.length}
Successfully Wrote/Updated: ${successCount}${dbError ? `
⚠️ Partial Error: ${dbError}` : ''}`);
            }, 500);
        } catch (e) {
            setSyncProgress('');
            setIsCrawling(false);
            setTimeout(() => {
                alert('Crawl failed: ' + e.message);
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
            if (!response.ok || !data.success) throw new Error(data.error || 'Server update failed');
            
            setCards(prev => prev.map(c => {
                if (String(c.id) === String(selectedLocalId)) {
                    const updatedCard = { ...c, poco_id: selectedPocaId };
                    if (overwriteImage && poca?.image) updatedCard.image = poca.image;
                    return updatedCard;
                }
                return c;
            }));
            setPocaCards(prev => prev.map(p => String(p.id) === String(selectedPocaId) ? { ...p, card_id: Number(selectedPocaId) } : p));
            setSelectedPocaId(null);
            setSelectedLocalId(null);
        } catch (error) {
            alert('Match failed: ' + error.message);
        }
    };
    
    if (!groups.length) {
        return <div className="p-8 text-center text-gray-500">Loading initial data...</div>
    }

    return (
        <main className="p-4 sm:p-6">
            <h1 className="text-2xl font-bold mb-4">Data Synchronization</h1>
            <div className="space-y-4 pb-24">
                <div className="px-4 pt-4">
                    <div className="flex space-x-1 overflow-x-auto no-scrollbar bg-gray-100 p-1 rounded-full w-fit">
                        <button onClick={() => setActiveSubTab('crawler')} className={`px-4 py-2 rounded-full text-sm font-bold transition-all ${activeSubTab === 'crawler' ? 'bg-white shadow text-black' : 'text-gray-500'}`}>Batch Crawl Settings</button>
                        <button onClick={() => setActiveSubTab('poca_match')} className={`px-4 py-2 rounded-full text-sm font-bold transition-all ${activeSubTab === 'poca_match' ? 'bg-white shadow text-black' : 'text-gray-500'}`}>POCA Match Settings</button>
                    </div>
                </div>

                {activeSubTab === 'poca_match' && (
                    <div className="flex flex-col md:flex-row gap-4 px-4 h-[85vh]">
                       {/* POCA Match UI */}
                       <div className="flex-1 min-w-0 bg-white border rounded-xl flex flex-col">
                           <div className="p-3 border-b flex justify-between items-center">
                               <h3 className="font-bold text-sm">Unmatched POCA Cards ({unmatchedPoca.length})</h3>
                               <button onClick={handlePocaCrawl} disabled={isCrawling} className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1">
                                   <RefreshCw className={`w-3 h-3 ${isCrawling ? 'animate-spin' : ''}`} /> {isCrawling ? syncProgress || 'Syncing...' : 'Sync'}
                               </button>
                           </div>
                           {/* ... Rest of the UI for matching ... */}
                       </div>
                       <div className="flex-[1.5] min-w-0 bg-white border rounded-xl flex flex-col">
                           <div className="p-3 border-b">
                                <h3 className="font-bold text-sm">Database Cards ({filteredLocalCards.length})</h3>
                           </div>
                           {/* ... Rest of the UI for local cards ... */}
                       </div>
                    </div>
                )}

                {activeSubTab === 'crawler' && (
                    <div className="bg-white border rounded-xl p-6 shadow-sm text-center flex flex-col items-center mx-4">
                        <h2 className="text-xl font-bold text-gray-800 mb-2">Batch Crawl Settings</h2>
                        <p className="text-gray-500 mb-6">Run the sync program to fetch the latest POCA cards and match the latest card prices.</p>
                        <button onClick={handlePocaCrawl} disabled={isCrawling} className="bg-indigo-600 text-white px-6 py-3 rounded-full font-bold shadow-lg hover:bg-indigo-700 disabled:opacity-50">
                            {isCrawling ? syncProgress || 'Syncing...' : 'Run Data Sync'}
                        </button>
                    </div>
                )}
                
                {missingPriceCard && (
                    <Modal 
                        title="Unknown Card Price Found" 
                        onClose={() => { if (confirm("Are you sure you want to stop the current sync progress?")) { if (missingPriceResolver.current) missingPriceResolver.current(null); setMissingPriceCard(null); } }}
                        className="max-w-sm" 
                        footer={<button onClick={handleMissingPriceSubmit} className="w-full py-3 rounded-xl bg-black text-white font-bold shadow-lg">Confirm and Continue</button>}
                    >
                        {/* ... Rest of missing price modal UI ... */}
                    </Modal>
                )}
            </div>
        </main>
    );
}
