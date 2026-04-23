"use client";

import { useState, useMemo } from 'react';
import { Image as ImageIcon, Plus, X } from 'lucide-react';
import { updateSeriesApi, insertSeries, fetchChannels, upsertCards, upsertBatches } from './actions';

export default function AdminClient({ initialSeries, initialGroups }: { initialSeries: any[], initialGroups: any[] }) {
    const [status, setStatus] = useState("等待同步...");
    const [fetchPages, setFetchPages] = useState(5);
    const [currentCursor, setCurrentCursor] = useState("");

    const [seriesList, setSeriesList] = useState<any[]>(initialSeries || []);
    const [groupsList, setGroupsList] = useState<any[]>(initialGroups || []);
    const [selectedSeriesId, setSelectedSeriesId] = useState("");
    const [apiIdInput, setApiIdInput] = useState("");

    const [isAddSeriesModalOpen, setIsAddSeriesModalOpen] = useState(false);
    const [newSeriesForm, setNewSeriesForm] = useState({ name: '', shortName: '', subunit: '', type: '', date: '' });

    const [filterGroupId, setFilterGroupId] = useState("");
    const [filterSubunit, setFilterSubunit] = useState("");
    const [filterType, setFilterType] = useState("");

    const availableSubunits = useMemo(() => {
        let filteredSeries = seriesList;
        if (filterGroupId) filteredSeries = filteredSeries.filter(s => String(s.group_id) === String(filterGroupId));
        const subunits = new Set(filteredSeries.map(s => s.subunit).filter(Boolean));
        return Array.from(subunits);
    }, [seriesList, filterGroupId]);

    const availableTypes = useMemo(() => {
        let filteredSeries = seriesList;
        if (filterGroupId) filteredSeries = filteredSeries.filter(s => String(s.group_id) === String(filterGroupId));
        if (filterSubunit) filteredSeries = filteredSeries.filter(s => s.subunit === filterSubunit);
        const types = new Set(filteredSeries.map(s => s.type).filter(Boolean));
        return Array.from(types);
    }, [seriesList, filterGroupId, filterSubunit]);

    const filteredSeriesList = useMemo(() => {
        let list = seriesList;
        if (filterGroupId) list = list.filter(s => String(s.group_id) === String(filterGroupId));
        if (filterSubunit) list = list.filter(s => s.subunit === filterSubunit);
        if (filterType) list = list.filter(s => s.type === filterType);
        
        return list.sort((a, b) => {
            const dateA = a.date ? new Date(a.date).getTime() : 253402214400000;
            const dateB = b.date ? new Date(b.date).getTime() : 253402214400000;
            return dateA - dateB;
        });
    }, [seriesList, filterGroupId, filterSubunit, filterType]);

    const handleSeriesClick = (id: any) => {
        setSelectedSeriesId(id);
        const targetSeries = seriesList.find(s => String(s.id) === String(id));
        setApiIdInput(targetSeries?.api || "");
    };

    const handleSaveApiId = async () => {
        if (!selectedSeriesId) return alert("請先選擇系列！");
        if (!apiIdInput) return alert("請輸入 API ID！");
        
        try {
            await updateSeriesApi(Number(selectedSeriesId), apiIdInput);
            alert("系列 API ID 儲存成功！");
            setSeriesList(prev => prev.map(s => String(s.id) === String(selectedSeriesId) ? { ...s, api: apiIdInput } : s));
        } catch (error: any) {
            alert(`儲存失敗: ${error.message}`);
        }
    };

    const handleOpenAddSeriesModal = () => {
        if (!filterGroupId) {
            return alert("請先在上方「篩選條件」選擇要新增系列所屬的「團體」！");
        }
        setNewSeriesForm({ name: '', shortName: '', subunit: filterSubunit || '', type: filterType || '', date: '' });
        setIsAddSeriesModalOpen(true);
    };

    const handleSaveNewSeries = async () => {
        if (!newSeriesForm.name.trim()) return alert("請輸入系列名稱！");

        const newSeries = {
            id: Date.now(),
            name: newSeriesForm.name.trim(),
            group_id: Number(filterGroupId),
            shortName: newSeriesForm.shortName.trim() || null,
            subunit: newSeriesForm.subunit.trim() || null,
            type: newSeriesForm.type.trim() || null,
            date: newSeriesForm.date || null
        };

        try {
            await insertSeries(newSeries);
            setSeriesList(prev => [...prev, newSeries]);
            setSelectedSeriesId(String(newSeries.id));
            setApiIdInput("");
            setIsAddSeriesModalOpen(false);
            alert("新增系列成功！請接續設定下方 API ID。");
        } catch (error: any) {
            alert(`新增失敗: ${error.message}`);
        }
    };

    const memberIdMap: Record<string, number> = {
        "SERIM": 1773335539939, "ALLEN": 1773335564943, "JUNGMO": 1773335582348,
        "WOOBIN": 1773335627799, "WONJIN": 1773335650832, "MINHEE": 1773335681886,
        "HYEONGJUN": 1773335705390, "TAEYOUNG": 1773335737259, "SEONGMIN": 1773335759275
    };

    const formatCard = (card: any, targetSeriesId: any) => ({
        id: card.id, name: card.name, member_id: memberIdMap[card.artistName] || null,
        image: card.thumbnailUrl, type: card.typeId, series_id: targetSeriesId, group_id: 1773331625412
    });

    const formatBatch = (record: any, channelMap: any, targetSeriesId: any) => {
        let channelId = null, batchNum = null, type = '簽售卡';
        const name = record.name;

        let match = name.match(/DtC\s*:\s*E\s+([a-zA-Z]+)?\s*([\d.]+)?/);
        if (match) {
            if (match[1]) channelId = channelMap[match[1].toUpperCase()] || null;
            if (match[2]) batchNum = match[2];
        } else {
            match = name.match(/(\d{2})\s*fm\s*(.*)/i);
            if (match) {
                const restOfString = match[2];
                for (const key of Object.keys(channelMap)) {
                    if (new RegExp(`\\b${key}\\b`, 'i').test(restOfString)) {
                        channelId = channelMap[key];
                        break; 
                    }
                }
                if (restOfString.toUpperCase().includes('LUCKY DRAW')) type = '特典卡'; 
            }
        }

        let imageUrl = record.thumbnailUrl;
        if (record.media && record.media.length > 0) imageUrl = record.media[0].thumbnailUrl || record.media[0].url;

        return {
            id: record.id, name: record.name, type: type, channel: channelId, batch_number: batchNum,
            date: record.releaseDate, group_id: 1773331625412, series_id: targetSeriesId, image: imageUrl
        };
    };

    const syncCards = async () => {
        try {
            if (fetchPages < 1) return;
            if (!selectedSeriesId) return setStatus("錯誤：請先在上方選擇要匯入的「系列」！");
            if (!apiIdInput) return setStatus("錯誤：該系列尚未設定 API ID，請先輸入並儲存！");

            let allFormattedCards: any[] = [];
            let tempCursor = currentCursor;

            for (let i = 0; i < fetchPages; i++) {
                setStatus(`正在抓取小卡第 ${i + 1} 頁 (已累積 ${allFormattedCards.length} 筆)...`);
                const url = tempCursor ? `/api/crawler/card?cursor=${tempCursor}&api_id=${apiIdInput}` : `/api/crawler/card?api_id=${apiIdInput}`;
                const response = await fetch(url);

                if (!response.ok) throw new Error(`API 請求失敗 (${response.status}): ${await response.text()}`);
                const data: any = await response.json();

                const apiData = data.data || data; // 🌟 支援有包裝或無包裝的資料結構
                if (!apiData.records || apiData.records.length === 0) {
                    setStatus("已到達資料最末端，無更多資料。");
                    break;
                }

                const formattedBatch = apiData.records.map((record: any) => formatCard(record, Number(selectedSeriesId)));
                allFormattedCards = allFormattedCards.concat(formattedBatch);
                tempCursor = apiData.next || null;
                if (!tempCursor) break;
            }

            setCurrentCursor(tempCursor || "");
            if (allFormattedCards.length === 0) return;
            setStatus(`成功抓取共 ${allFormattedCards.length} 筆，準備過濾重複資料並寫入...`);

            const uniqueCardsMap = new Map();
            allFormattedCards.forEach(card => uniqueCardsMap.set(card.id, card));
            
            const insertedCount = await upsertCards(Array.from(uniqueCardsMap.values()));
            if (insertedCount === 0) {
                return setStatus("警告：執行成功，但沒有寫入/更新任何資料。");
            }
            setStatus(`同步完成！成功寫入 ${insertedCount} 筆不重複資料。下一次將從新的指標繼續抓取。`);
        } catch (error: any) {
            console.error('小卡同步失敗:', error);
            setStatus(`發生錯誤: ${error.message}`);
        }
    };

    const syncBatches = async () => {
        try {
            if (fetchPages < 1) return;
            if (!selectedSeriesId) return setStatus("錯誤：請先在上方選擇要匯入的「系列」！");
            if (!apiIdInput) return setStatus("錯誤：該系列尚未設定 API ID，請先輸入並儲存！");

            setStatus("正在讀取通路頻道列表...");
            const channelsData = await fetchChannels();
            const channelMap: Record<string, number> = {};
            channelsData?.forEach((c: any) => { if (c.name) channelMap[c.name.toUpperCase()] = c.id; });

            let allFormattedBatches: any[] = [];
            let tempCursor = currentCursor;

            for (let i = 0; i < fetchPages; i++) {
                setStatus(`正在抓取批次第 ${i + 1} 頁 (已累積 ${allFormattedBatches.length} 筆)...`);
                const url = tempCursor ? `/api/crawler/batches?cursor=${tempCursor}&api_id=${apiIdInput}` : `/api/crawler/batches?api_id=${apiIdInput}`;
                const response = await fetch(url);

                if (!response.ok) throw new Error(`API 請求失敗 (${response.status}): ${await response.text()}`);
                const data: any = await response.json();

                const apiData = data.data || data; // 🌟 支援有包裝或無包裝的資料結構
                if (!apiData.records || apiData.records.length === 0) {
                    setStatus("已到達資料最末端，無更多資料。");
                    break;
                }

                const formattedBatch = apiData.records.map((record: any) => formatBatch(record, channelMap, Number(selectedSeriesId)));
                allFormattedBatches = allFormattedBatches.concat(formattedBatch);
                tempCursor = apiData.next || null;
                if (!tempCursor) break;
            }

            setCurrentCursor(tempCursor || "");
            if (allFormattedBatches.length === 0) return;
            setStatus(`成功抓取共 ${allFormattedBatches.length} 筆，準備過濾重複資料並寫入...`);

            const uniqueBatchesMap = new Map();
            allFormattedBatches.forEach(batch => uniqueBatchesMap.set(batch.id, batch));
            
            const insertedCount = await upsertBatches(Array.from(uniqueBatchesMap.values()));
            if (insertedCount === 0) {
                return setStatus("警告：執行成功，但沒有寫入/更新任何資料。");
            }
            setStatus(`同步完成！成功寫入 ${insertedCount} 筆不重複資料。下一次將從新的指標繼續抓取。`);
        } catch (error: any) {
            console.error('批次同步失敗:', error);
            setStatus(`發生錯誤: ${error.message}`);
        }
    };

    return (
        <div className="p-10 flex flex-col items-start gap-4">
            <h1 className="text-2xl font-bold">後台資料同步管理</h1>
            
            <div className="flex flex-col gap-2 p-4 border rounded-lg bg-gray-50 w-full max-w-3xl">
                <h2 className="font-bold text-gray-700">批次抓取設定 (Cursor-based)</h2>
                <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm text-gray-600">連續抓取</span>
                    <input 
                        type="number" 
                        value={fetchPages} 
                        onChange={(e) => setFetchPages(Number(e.target.value))}
                        className="w-20 px-2 py-1 border rounded"
                        min="1" max="20"
                    />
                    <span className="text-sm text-gray-600">頁 (每頁約100筆)</span>
                </div>
                <div className="flex items-center gap-2">
                    <button 
                        onClick={() => setCurrentCursor("")}
                        className="px-2 py-1 bg-red-100 text-red-600 text-sm rounded border border-red-200"
                    >重置進度 (從頭抓取)</button>
                    {currentCursor && <span className="text-xs text-gray-500">已有暫存進度，下次將接續抓取。</span>}
                </div>
                
                <div className="mt-4 pt-4 border-t border-gray-200 w-full">
                    <h3 className="text-sm font-bold text-gray-700 mb-3">小卡匯入系列設定</h3>
                    
                    <div className="flex flex-col gap-2 mb-3 p-3 bg-white border border-gray-200 rounded-lg shadow-sm">
                        <div className="text-xs font-bold text-gray-500 mb-1">篩選條件</div>
                        <div className="flex flex-col gap-3">
                            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                                <span className="text-xs font-bold text-gray-400 whitespace-nowrap min-w-fit">團體</span>
                                <div className="flex gap-2">
                                    <button onClick={() => setFilterGroupId("")} className={`px-3 py-1.5 text-xs rounded-full border transition-all whitespace-nowrap select-none ${filterGroupId === "" ? 'bg-indigo-600 text-white border-indigo-600 font-bold shadow-sm' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>全部</button>
                                    {groupsList.map(g => (
                                        <button key={g.id} onClick={() => setFilterGroupId(g.id)} className={`px-3 py-1.5 text-xs rounded-full border transition-all whitespace-nowrap select-none ${String(filterGroupId) === String(g.id) ? 'bg-indigo-600 text-white border-indigo-600 font-bold shadow-sm' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>{g.name}</button>
                                    ))}
                                </div>
                            </div>
                            
                            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                                <span className="text-xs font-bold text-gray-400 whitespace-nowrap min-w-fit">分隊</span>
                                <div className="flex gap-2">
                                    <button onClick={() => setFilterSubunit("")} className={`px-3 py-1.5 text-xs rounded-full border transition-all whitespace-nowrap select-none ${filterSubunit === "" ? 'bg-indigo-600 text-white border-indigo-600 font-bold shadow-sm' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>全部</button>
                                    {availableSubunits.map(sub => (
                                        <button key={sub} onClick={() => setFilterSubunit(sub)} className={`px-3 py-1.5 text-xs rounded-full border transition-all whitespace-nowrap select-none ${filterSubunit === sub ? 'bg-indigo-600 text-white border-indigo-600 font-bold shadow-sm' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>{sub}</button>
                                    ))}
                                </div>
                            </div>

                            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                                <span className="text-xs font-bold text-gray-400 whitespace-nowrap min-w-fit">類型</span>
                                <div className="flex gap-2">
                                    <button onClick={() => setFilterType("")} className={`px-3 py-1.5 text-xs rounded-full border transition-all whitespace-nowrap select-none ${filterType === "" ? 'bg-indigo-600 text-white border-indigo-600 font-bold shadow-sm' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>全部</button>
                                    {availableTypes.map(t => (
                                        <button key={t} onClick={() => setFilterType(t)} className={`px-3 py-1.5 text-xs rounded-full border transition-all whitespace-nowrap select-none ${filterType === t ? 'bg-indigo-600 text-white border-indigo-600 font-bold shadow-sm' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>{t}</button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col gap-2">
                        <div className="flex justify-between items-center mb-1">
                            <div className="text-xs font-bold text-gray-500">選擇要匯入的系列</div>
                            <button onClick={handleOpenAddSeriesModal} className="text-xs bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded flex items-center gap-1 text-gray-600 font-bold transition-colors">
                                <Plus className="w-3 h-3" /> 新增系列
                            </button>
                        </div>
                        <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
                            {filteredSeriesList.map(s => (
                                <div 
                                    key={s.id} onClick={() => handleSeriesClick(s.id)}
                                    className={`relative w-28 h-28 aspect-square rounded-lg overflow-hidden cursor-pointer flex-shrink-0 group select-none ${String(selectedSeriesId) === String(s.id) ? 'ring-2 ring-indigo-500' : 'border border-gray-200'}`}
                                >
                                    {s.image ? (
                                        <img src={s.image} alt={s.name} className="w-full h-full object-cover brightness-75 group-hover:brightness-100 transition-all pointer-events-none" />
                                    ) : (
                                        <div className="w-full h-full bg-gray-200 flex items-center justify-center">
                                            <ImageIcon className="w-8 h-8 text-gray-400" />
                                        </div>
                                    )}
                                    <div className="absolute inset-0 flex flex-col justify-end p-2 bg-gradient-to-t from-black/70 to-transparent">
                                        <span className="text-white font-bold text-sm truncate w-full">{s.name}</span>
                                        {s.shortName && <span className="text-white/70 text-[10px]">{s.shortName}</span>}
                                    </div>
                                </div>
                            ))}
                            {filteredSeriesList.length === 0 && <div className="text-sm text-gray-400 py-4 px-2">沒有符合條件的系列</div>}
                        </div>
                        
                        <div className="flex gap-2 items-center">
                            <input 
                                type="text" placeholder="輸入 KOCA API 數字 (例如: 565)"
                                value={apiIdInput} onChange={(e) => setApiIdInput(e.target.value)}
                                className="flex-1 px-2 py-1.5 border rounded text-sm outline-none focus:ring-1 focus:ring-indigo-300"
                            />
                            <button onClick={handleSaveApiId} className="px-3 py-1.5 bg-gray-800 text-white text-sm rounded hover:bg-gray-700 whitespace-nowrap font-bold transition-colors">儲存 API ID</button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex gap-4">
                <button onClick={syncCards} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">同步小卡</button>
                <button onClick={syncBatches} className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700">同步批次</button>
            </div>

            <p className="text-gray-600 font-medium mt-2">{status}</p>

            {isAddSeriesModalOpen && (
                <div className="fixed inset-0 z-[150] bg-black/30 backdrop-blur-sm flex items-center justify-center animate-fade-in p-4">
                    <div className="bg-white/90 backdrop-blur-xl border border-white/50 w-full max-w-lg shadow-2xl rounded-2xl flex flex-col overflow-hidden">
                        <div className="px-4 py-3 border-b border-gray-200/50 flex justify-between items-center bg-white/50 backdrop-blur-sm z-10">
                            <div className="font-bold text-lg text-gray-800">新增系列</div>
                            <button onClick={() => setIsAddSeriesModalOpen(false)} className="p-2 rounded-full hover:bg-gray-100 transition-colors">
                                <X className="w-6 h-6 text-gray-500" />
                            </button>
                        </div>
                        <div className="p-4 space-y-4 overflow-y-auto max-h-[70vh]">
                            <div><label className="block text-sm font-bold text-gray-700 mb-1">名稱</label><input className="w-full border p-2 rounded-lg outline-none focus:ring-2 focus:ring-indigo-100" placeholder="請輸入名稱" value={newSeriesForm.name} onChange={e => setNewSeriesForm({...newSeriesForm, name: e.target.value})} /></div>
                            <div><label className="block text-sm font-bold text-gray-700 mb-1">簡稱 (選填)</label><input className="w-full border p-2 rounded-lg outline-none focus:ring-2 focus:ring-indigo-100" placeholder="Ex. 迷一" value={newSeriesForm.shortName} onChange={e => setNewSeriesForm({...newSeriesForm, shortName: e.target.value})} /></div>
                            <div><label className="block text-sm font-bold text-gray-700 mb-1">所屬分隊 (選填，無則留空)</label><input className="w-full border p-2 rounded-lg outline-none focus:ring-2 focus:ring-indigo-100" placeholder="Ex. 舞蹈小分隊..." value={newSeriesForm.subunit} onChange={e => setNewSeriesForm({...newSeriesForm, subunit: e.target.value})} /></div>
                            <div><label className="block text-sm font-bold text-gray-700 mb-1">系列類型</label><input className="w-full border p-2 rounded-lg outline-none focus:ring-2 focus:ring-indigo-100" placeholder="Ex. 專輯, 特典..." value={newSeriesForm.type} onChange={e => setNewSeriesForm({...newSeriesForm, type: e.target.value})} /></div>
                            <div><label className="block text-sm font-bold text-gray-700 mb-1">發行日期</label><input type="date" className="w-full border p-2 rounded-lg outline-none focus:ring-2 focus:ring-indigo-100" value={newSeriesForm.date} onChange={e => setNewSeriesForm({...newSeriesForm, date: e.target.value})} /></div>
                        </div>
                        <div className="px-4 py-3 border-t border-gray-200/50 bg-white/50 backdrop-blur-sm flex justify-end gap-2">
                            <button onClick={() => setIsAddSeriesModalOpen(false)} className="px-4 py-2 rounded-lg border text-gray-500 hover:bg-gray-100 font-bold">取消</button>
                            <button onClick={handleSaveNewSeries} className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 font-bold">確認新增</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}