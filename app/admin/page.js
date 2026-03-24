"use client";

import { useState, useEffect } from 'react';
import { supabase } from '@/utils/supabase';

export default function AdminPage() {
    const [status, setStatus] = useState("等待同步...");
    const [fetchPages, setFetchPages] = useState(5); // 預設一次抓 5 頁 (500筆)
    const [currentCursor, setCurrentCursor] = useState(""); // 記錄當前指標，方便中斷後繼續

    // 系列選擇相關狀態
    const [seriesList, setSeriesList] = useState([]);
    const [selectedSeriesId, setSelectedSeriesId] = useState("");
    const [apiIdInput, setApiIdInput] = useState("");

    useEffect(() => {
        const fetchSeries = async () => {
            const { data } = await supabase.from('series').select('*');
            if (data) setSeriesList(data);
        };
        fetchSeries();
    }, []);

    const handleSeriesChange = (e) => {
        const id = e.target.value;
        setSelectedSeriesId(id);
        const targetSeries = seriesList.find(s => String(s.id) === String(id));
        setApiIdInput(targetSeries?.api_id || "");
    };

    const handleSaveApiId = async () => {
        if (!selectedSeriesId) return alert("請先選擇系列！");
        if (!apiIdInput) return alert("請輸入 API ID！");
        
        const { error } = await supabase.from('series').update({ api_id: apiIdInput }).eq('id', selectedSeriesId);
        if (error) {
            alert(`儲存失敗: ${error.message}`);
        } else {
            alert("系列 API ID 儲存成功！");
            setSeriesList(prev => prev.map(s => String(s.id) === String(selectedSeriesId) ? { ...s, api_id: apiIdInput } : s));
        }
    };

    const memberIdMap = {
        "SERIM": 1773335539939,
        "ALLEN": 1773335564943,
        "JUNGMO": 1773335582348,
        "WOOBIN": 1773335627799,
        "WONJIN": 1773335650832,
        "MINHEE": 1773335681886,
        "HYEONGJUN": 1773335705390,
        "TAEYOUNG": 1773335737259,
        "SEONGMIN": 1773335759275
    };


    // 小卡資料轉換規則
    const formatCard = (card, targetSeriesId) => ({
        id: card.id,
        name: card.name,
        member_id: memberIdMap[card.artistName] || null,
        image: card.thumbnailUrl,
        type: card.typeId,
        series_id: targetSeriesId,
        group_id: 1773331625412
    });

    // 批次資料轉換規則
    const formatBatch = (record, channelMap) => {
        let channelId = null;
        let batchNum = null;
        let type = '簽售卡'; // Default type

        const name = record.name;

        // Pattern 1: DtC : E {channel} {version}
        let match = name.match(/DtC\s*:\s*E\s+([a-zA-Z]+)?\s*([\d.]+)?/);
        
        if (match) {
            if (match[1]) {
                channelId = channelMap[match[1].toUpperCase()] || null;
            }
            if (match[2]) {
                batchNum = match[2];
            }
        } else {
            // Pattern 2 & 3: {year} fm ...
            match = name.match(/(\d{2})\s*fm\s*(.*)/i);
            if (match) {
                const restOfString = match[2];
                // Try to find a known channel name in the rest of the string
                const channelKeys = Object.keys(channelMap);
                for (const key of channelKeys) {
                    // Use a regex to match the channel name as a whole word
                    const channelRegex = new RegExp(`\\b${key}\\b`, 'i');
                    if (channelRegex.test(restOfString)) {
                        channelId = channelMap[key];
                        break; // Stop after finding the first channel
                    }
                }

                if (restOfString.toUpperCase().includes('LUCKY DRAW')) {
                    type = '特典卡'; 
                }
            }
        }

        // 處理圖片來源：新版 API 將圖片放在 media 陣列中
        let imageUrl = record.thumbnailUrl;
        if (record.media && record.media.length > 0) {
            imageUrl = record.media[0].thumbnailUrl || record.media[0].url;
        }

        return {
            id: record.id,
            name: record.name,
            type: type,
            channel: channelId, // 寫入 channels 資料表的 id
            batch_number: batchNum, // 寫入數字部分 (如 '6.0')
            date: record.releaseDate,
            group_id: 1773331625412,
            series_id: 1773423703992,
            image: imageUrl
        };
    };

    const syncCards = async () => {
        try {
            if (fetchPages < 1) return;
            if (!selectedSeriesId) {
                setStatus("錯誤：請先在上方選擇要匯入的「系列」！");
                return;
            }
            if (!apiIdInput) {
                setStatus("錯誤：該系列尚未設定 API ID，請先輸入並儲存！");
                return;
            }

            let allFormattedCards = [];
            let tempCursor = currentCursor;

            for (let i = 0; i < fetchPages; i++) {
                setStatus(`正在抓取小卡第 ${i + 1} 頁 (已累積 ${allFormattedCards.length} 筆)...`);
                
                const url = tempCursor 
                    ? `/api/crawler/card?cursor=${tempCursor}&api_id=${apiIdInput}` 
                    : `/api/crawler/card?api_id=${apiIdInput}`;
                const response = await fetch(url);

                if (!response.ok) {
                    const errText = await response.text();
                    throw new Error(`API 請求失敗 (${response.status}): ${errText.substring(0, 100)}`);
                }
                const data = await response.json();

                if (!data.records || data.records.length === 0) {
                    setStatus("已到達資料最末端，無更多資料。");
                    break;
                }

                const formattedBatch = data.records.map(record => formatCard(record, selectedSeriesId));

                allFormattedCards = allFormattedCards.concat(formattedBatch);
                tempCursor = data.next || null;

                if (!tempCursor) {
                    break;
                }
            }

            setCurrentCursor(tempCursor || "");

            if (allFormattedCards.length === 0) {
                return;
            }

            setStatus(`成功抓取共 ${allFormattedCards.length} 筆，準備過濾重複資料並寫入...`);

            const uniqueCardsMap = new Map();
            allFormattedCards.forEach(card => {
                uniqueCardsMap.set(card.id, card); 
            });
            const finalCardsToUpsert = Array.from(uniqueCardsMap.values());

            const { data: insertedData, error } = await supabase
                .from('ui_cards') 
                .upsert(finalCardsToUpsert, { onConflict: 'id' })
                .select(); 

            if (error) throw error;

            if (!insertedData || insertedData.length === 0) {
                setStatus("警告：執行成功，但 Supabase 沒有真正寫入/更新任何資料。");
                return;
            }

            setStatus(`同步完成！成功寫入 ${insertedData.length} 筆不重複資料。下一次將從新的指標繼續抓取。`);

        } catch (error) {
            console.error('小卡同步失敗:', error);
            setStatus(`發生錯誤: ${error.message}`);
        }
    };

    const syncBatches = async () => {
        try {
            if (fetchPages < 1) return;

            setStatus("正在讀取通路頻道列表...");
            const { data: channelsData, error: channelsError } = await supabase
                .from('channels')
                .select('id, name');
            if (channelsError) throw new Error(`讀取通路頻道列表失敗: ${channelsError.message}`);

            const channelMap = {};
            if (channelsData) {
                channelsData.forEach(c => {
                    if (c.name) channelMap[c.name.toUpperCase()] = c.id;
                });
            }

            let allFormattedBatches = [];
            let tempCursor = currentCursor;

            for (let i = 0; i < fetchPages; i++) {
                setStatus(`正在抓取批次第 ${i + 1} 頁 (已累積 ${allFormattedBatches.length} 筆)...`);
                
                const url = tempCursor ? `/api/crawler/batches?cursor=${tempCursor}` : '/api/crawler/batches';
                const response = await fetch(url);

                if (!response.ok) {
                    const errText = await response.text();
                    throw new Error(`API 請求失敗 (${response.status}): ${errText.substring(0, 100)}`);
                }
                const data = await response.json();

                if (!data.records || data.records.length === 0) {
                    setStatus("已到達資料最末端，無更多資料。");
                    break;
                }

                const formattedBatch = data.records.map(record => formatBatch(record, channelMap));

                allFormattedBatches = allFormattedBatches.concat(formattedBatch);
                tempCursor = data.next || null;

                if (!tempCursor) {
                    break;
                }
            }

            setCurrentCursor(tempCursor || "");

            if (allFormattedBatches.length === 0) {
                return;
            }

            setStatus(`成功抓取共 ${allFormattedBatches.length} 筆，準備過濾重複資料並寫入...`);

            const uniqueBatchesMap = new Map();
            allFormattedBatches.forEach(batch => {
                uniqueBatchesMap.set(batch.id, batch); 
            });
            const finalBatchesToUpsert = Array.from(uniqueBatchesMap.values());

            const { data: insertedData, error } = await supabase
                .from('batches') 
                .upsert(finalBatchesToUpsert, { onConflict: 'id' })
                .select(); 

            if (error) throw error;

            if (!insertedData || insertedData.length === 0) {
                setStatus("警告：執行成功，但 Supabase 沒有真正寫入/更新任何資料。");
                return;
            }

            setStatus(`同步完成！成功寫入 ${insertedData.length} 筆不重複資料。下一次將從新的指標繼續抓取。`);

        } catch (error) {
            console.error('批次同步失敗:', error);
            setStatus(`發生錯誤: ${error.message}`);
        }
    };

    return (
        <div className="p-10 flex flex-col items-start gap-4">
            <h1 className="text-2xl font-bold">後台資料同步管理</h1>
            
            <div className="flex flex-col gap-2 p-4 border rounded-lg bg-gray-50 w-full max-w-md">
                <h2 className="font-bold text-gray-700">批次抓取設定 (Cursor-based)</h2>
                <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm text-gray-600">連續抓取</span>
                    <input 
                        type="number" 
                        value={fetchPages} 
                        onChange={(e) => setFetchPages(Number(e.target.value))}
                        className="w-20 px-2 py-1 border rounded"
                        min="1"
                        max="20"
                    />
                    <span className="text-sm text-gray-600">頁 (每頁約100筆)</span>
                </div>
                <div className="flex items-center gap-2">
                    <button 
                        onClick={() => setCurrentCursor("")}
                        className="px-2 py-1 bg-red-100 text-red-600 text-sm rounded border border-red-200"
                    >
                        重置進度 (從頭抓取)
                    </button>
                    {currentCursor && <span className="text-xs text-gray-500">已有暫存進度，下次將接續抓取。</span>}
                </div>
                
                <div className="mt-4 pt-4 border-t border-gray-200 w-full">
                    <h3 className="text-sm font-bold text-gray-700 mb-2">小卡匯入系列設定</h3>
                    <div className="flex flex-col gap-2">
                        <select 
                            value={selectedSeriesId} 
                            onChange={handleSeriesChange}
                            className="w-full px-2 py-1.5 border rounded text-sm bg-white"
                        >
                            <option value="">-- 請選擇要匯入的系列 --</option>
                            {seriesList.map(s => (
                                <option key={s.id} value={s.id}>{s.name} {s.shortName ? `(${s.shortName})` : ''}</option>
                            ))}
                        </select>
                        
                        <div className="flex gap-2 items-center">
                            <input 
                                type="text" 
                                placeholder="輸入 KOCA API 數字 (例如: 565)"
                                value={apiIdInput}
                                onChange={(e) => setApiIdInput(e.target.value)}
                                className="flex-1 px-2 py-1.5 border rounded text-sm"
                            />
                            <button 
                                onClick={handleSaveApiId}
                                className="px-3 py-1.5 bg-gray-800 text-white text-sm rounded hover:bg-gray-700 whitespace-nowrap font-bold"
                            >
                                儲存 API ID
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex gap-4">
                <button 
                    onClick={syncCards}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                    開始同步小卡
                </button>

                <button 
                    onClick={syncBatches}
                    className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                >
                    同步 DtC : E 批次 (Batches)
                </button>
            </div>

            <p className="text-gray-600 font-medium mt-2">{status}</p>
        </div>
    );
}
