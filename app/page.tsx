// @ts-nocheck
"use client";
import Image from 'next/image';
import Link from 'next/link';
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { supabase as realSupabase } from '@/lib/supabaseClient'; // 🌟 保留原始連線供圖片上傳使用
import { 
  Camera, Plus, Trash2, DollarSign, Calendar, Layers, Grid, List, 
  Image as ImageIcon, CheckCircle, XCircle, Share2, Download, Eye, EyeOff,
  X, Maximize2, Minimize2, Save, BookOpen, User, Settings, Filter, 
  ChevronRight, MoreHorizontal, Search, Edit2, Check, Users, Heart, ShoppingBag, FolderPlus,
  ArrowLeft, CheckSquare, MoreVertical, Tag, Store, ChevronDown, PenTool, Coins, Minus, AlertCircle, TrendingUp, ArrowUpDown,
  ChevronLeft, Folder, Package, Copy, Disc, RefreshCw, Printer
} from 'lucide-react';

import * as htmlToImage from 'html-to-image';

// 🌟 終極 D1 攔截器：將前端所有 Supabase 寫入操作，無縫攔截並轉交給 D1 API
class D1QueryBuilder {
    payload: any;
    constructor(table: string, action: string, data = null) {
        this.payload = { table, action, data, filters: [] };
    }
    eq(col: string, val: any) { this.payload.filters.push({ col, val, op: 'eq' }); return this; }
    in(col: string, vals: any[]) { this.payload.filters.push({ col, vals, op: 'in' }); return this; }
    async then(resolve?: (val: any) => void, reject?: (err: any) => void) {
        try {
            const res = await fetch('/api/data', { 
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(this.payload) 
            });
            const json = await res.json();
            if (typeof resolve === 'function') resolve(json); // 仿造 Supabase 格式 { error: null }
        } catch (e) {
            if (typeof reject === 'function') reject(e);
        }
    }
}
const supabase = {
    ...realSupabase,
    from: (table: string) => ({
        select: () => realSupabase.from(table).select(), // 保留 select 防呆
        insert: (data: any) => new D1QueryBuilder(table, 'insert', data),
        upsert: (data: any) => new D1QueryBuilder(table, 'upsert', data),
        update: (data: any) => new D1QueryBuilder(table, 'update', data),
        delete: () => new D1QueryBuilder(table, 'delete')
    })
};

// --- 🌟 資料庫欄位名稱轉換工具 (處理 JS 駝峰命名與資料庫底線命名的差異) ---
const toSnakeCase = (obj) => {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
    const res = {};
    Object.keys(obj).forEach(k => {
        const snake = k.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
        res[snake] = obj[k];
    });
    return res;
};

const generateUUID = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => (c === 'x' ? (Math.random() * 16 | 0) : ((Math.random() * 16 | 0) & 0x3 | 0x8)).toString(16));
};

import Cropper from 'react-easy-crop';
// 🌟 1. 內建裁切剪刀 (放在 ImageUploader 元件外面/上方，確保絕對找得到！)
// 🌟 終極防爆版：內建自動壓縮與邊界安全檢查
const getCroppedImg = async (imageSrc, pixelCrop) => {
    const image = new window.Image();
    image.src = imageSrc;
    
    // 等待圖片載入
    await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(new Error('圖片載入失敗'));
    });

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    // 1. 強制轉成整數，避免某些瀏覽器對小數點報錯
    const cropWidth = Math.max(1, Math.round(pixelCrop.width));
    const cropHeight = Math.max(1, Math.round(pixelCrop.height));
    const cropX = Math.round(pixelCrop.x);
    const cropY = Math.round(pixelCrop.y);

    // 2. 🌟 防爆機制：設定最大寬高，避免原始圖片太大導致手機瀏覽器崩潰
    const MAX_SIZE = 1000; 
    let scale = 1;
    if (cropWidth > MAX_SIZE || cropHeight > MAX_SIZE) {
        scale = MAX_SIZE / Math.max(cropWidth, cropHeight);
    }

    // 計算最終輸出的安全尺寸
    const finalWidth = Math.max(1, Math.round(cropWidth * scale));
    const finalHeight = Math.max(1, Math.round(cropHeight * scale));

    canvas.width = finalWidth;
    canvas.height = finalHeight;

    // 3. 繪製並同時壓縮尺寸
    ctx.drawImage(
        image,
        cropX,
        cropY,
        cropWidth,
        cropHeight,
        0,
        0,
        finalWidth,
        finalHeight
    );

    // 4. 壓縮成 JPG，品質 0.8 (這樣每張圖片大約只佔 50~150KB，極度輕量！)
    return canvas.toDataURL('image/jpeg', 0.8);
};

// 🌟 2. 升級版圖片上傳元件
const ImageUploader = ({ image, images = [], onChange, label = "上傳圖片", className = "h-32", multiple = false, aspect = 2/3, enableCrop = true }) => {
  const ref = useRef(null);
  
  const [pendingCrops, setPendingCrops] = useState([]);
  const [currentCropImage, setCurrentCropImage] = useState(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [processedImages, setProcessedImages] = useState([]);

  const handleUpload = (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
        Promise.all(files.map(file => {
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.readAsDataURL(file);
            });
        })).then(results => {
            if (enableCrop) {
                setPendingCrops(results);
                setProcessedImages([]);
                setCurrentCropImage(results[0]);
                setCrop({ x: 0, y: 0 });
                setZoom(1);
            } else {
                if (multiple) onChange([...images, ...results]);
                else onChange(results[0]);
            }
        });
    }
    e.target.value = ''; 
  };

  const handleCropComplete = useCallback((croppedArea, croppedAreaPixels) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  // 🌟 升級防呆與錯誤捕捉的完成按鈕
  const confirmCrop = async () => {
     if (!currentCropImage) return;
     
     // 防呆：如果剛上傳還沒抓到裁切範圍，擋住並提示
     if (!croppedAreaPixels) {
         alert("圖片正在處理中，請稍微滑動一下圖片後再按完成。");
         return;
     }

     try {
         // 使用內建的剪刀裁切圖片
         const croppedBase64 = await getCroppedImg(currentCropImage, croppedAreaPixels);

         const nextProcessed = [...processedImages, croppedBase64];
         const nextPending = pendingCrops.slice(1);

         if (nextPending.length > 0) {
             setProcessedImages(nextProcessed);
             setPendingCrops(nextPending);
             setCurrentCropImage(nextPending[0]);
             setCrop({ x: 0, y: 0 });
             setZoom(1);
         } else {
             if (multiple) onChange([...images, ...nextProcessed]);
             else onChange(nextProcessed[0]);
             
             // 成功後關閉視窗
             setPendingCrops([]);
             setCurrentCropImage(null);
             setProcessedImages([]);
         }
     } catch (error) {
         console.error("圖片裁切失敗:", error);
         alert("圖片處理發生錯誤，請換一張圖片試試看！");
     }
  };

  const cancelCrop = () => {
      setPendingCrops([]);
      setCurrentCropImage(null);
      setProcessedImages([]);
  };

  const removeImage = (e, index) => {
      e.stopPropagation();
      const newImages = [...images];
      newImages.splice(index, 1);
      onChange(newImages);
  };
  return (
    <>
    <div 
      onClick={() => ref.current.click()}
      className={`relative w-full border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50 hover:border-indigo-400 transition-all bg-gray-50 overflow-hidden group ${className}`}
    >
      {multiple && images.length > 0 ? (
          <div className="absolute inset-0 p-2 overflow-y-auto no-scrollbar grid grid-cols-3 gap-2">
              {images.map((img, idx) => (
                  <div key={idx} className="relative aspect-[2/3] rounded overflow-hidden border">
                      <img src={img} className="w-full h-full object-cover" />
                      <button onClick={(e) => removeImage(e, idx)} className="absolute top-0 right-0 bg-red-500 text-white p-0.5 rounded-bl z-10"><X className="w-3 h-3" /></button>
                  </div>
              ))}
              <div className="flex items-center justify-center border-2 border-dashed border-gray-300 rounded aspect-[2/3] text-gray-400 bg-white">
                  <Plus className="w-6 h-6" />
              </div>
          </div>
      ) : image ? (
        <>
          <img src={image} className="absolute inset-0 w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <Camera className="text-white w-8 h-8" />
          </div>
        </>
      ) : (
        <div className="text-gray-400 flex flex-col items-center pointer-events-none">
          <Camera className="w-8 h-8 mb-2" />
          <span className="text-xs">{multiple ? "可選擇多張圖片" : label}</span>
        </div>
      )}
      <input type="file" ref={ref} className="hidden" accept="image/*" multiple={multiple} onChange={handleUpload} />
    </div>

    {currentCropImage && (
        <div 
            className="fixed inset-0 z-[9999] bg-black/95 flex flex-col animate-fade-in" 
            style={{ touchAction: 'none' }} 
            onClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()} onTouchEnd={(e) => e.stopPropagation()}
        >
            <div className="pt-12 pb-4 px-4 flex justify-center items-center bg-black text-white z-10">
                <div className="font-bold text-sm tracking-wider text-gray-300">
                    {pendingCrops.length > 1 ? `裁剪 (還剩 ${pendingCrops.length - 1} 張)` : '移動圖片並縮放'}
                </div>
            </div>
            
            <div className="flex-1 relative">
                <Cropper
                    image={currentCropImage}
                    crop={crop}
                    zoom={zoom}
                    aspect={aspect}
                    onCropChange={setCrop}
                    onCropComplete={handleCropComplete}
                    onZoomChange={setZoom}
                />
            </div>
            
            <div className="bg-black flex flex-col items-center justify-center px-6 pb-10 pt-4 z-10">
                <input 
                    type="range" min={1} max={3} step={0.05} 
                    value={zoom} onChange={(e) => setZoom(e.target.value)}
                    className="w-full max-w-sm accent-indigo-500 mb-8"
                />
                <div className="flex justify-between w-full max-w-sm gap-4">
                    <button 
                        onClick={(e) => { e.stopPropagation(); cancelCrop(); }} 
                        onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); cancelCrop(); }} 
                        className="flex-1 py-3 rounded-full font-bold text-gray-300 bg-gray-800 hover:bg-gray-700 transition-colors"
                    >
                        取消
                    </button>
                    <button 
                        onClick={(e) => { e.stopPropagation(); confirmCrop(); }} 
                        onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); confirmCrop(); }} 
                        className="flex-[2] py-3 rounded-full font-bold text-white bg-indigo-600 hover:bg-indigo-500 transition-colors shadow-lg"
                    >
                        完成
                    </button>
                </div>
            </div>
        </div>
    )}
    </>
  );
};

const toCamelCase = (obj) => {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
    const res = {};
    Object.keys(obj).forEach(k => {
        const camel = k.replace(/_([a-z])/g, g => g[1].toUpperCase());
        res[camel] = obj[k];
    });
    return res;
};

// --- 2. Hooks & Utilities ---
const getInitialCols = () => typeof window !== 'undefined' && window.innerWidth < 768 ? 4 : 6;

const useLongPress = (onLongPress, onClick, ms = 600) => {
  const timerRef = useRef(null);
  const isLongPress = useRef(false);

  const start = () => {
    isLongPress.current = false;
    timerRef.current = setTimeout(() => {
        isLongPress.current = true;
        if (onLongPress) onLongPress();
    }, ms);
  };

  const stop = () => {
    clearTimeout(timerRef.current);
  };

  const handleClick = (e) => {
      if (isLongPress.current) {
          e.preventDefault();
          e.stopPropagation();
          return;
      }
      if (onClick) onClick(e);
  };

  return {
    onMouseDown: start,
    onMouseUp: stop,
    onMouseLeave: stop,
    onTouchStart: start,
    onTouchEnd: stop,
    onClick: handleClick
  };
};

// 🌟 新增：右滑返回上一頁的 Hook
const useSwipeToClose = (onClose) => {
    const touchStartX = useRef(0);
    const touchStartY = useRef(0);
    
    const onTouchStart = (e) => {
        e.stopPropagation(); // 🌟 防止事件冒泡到主頁面，避免誤觸分頁切換
        touchStartX.current = e.targetTouches[0].clientX;
        touchStartY.current = e.targetTouches[0].clientY;
    };

    const onTouchEnd = (e) => {
        e.stopPropagation(); // 🌟 防止事件冒泡
        const diffX = touchStartX.current - e.changedTouches[0].clientX;
        const diffY = touchStartY.current - e.changedTouches[0].clientY;
        if (Math.abs(diffY) > Math.abs(diffX)) return; // 垂直滑動忽略
        if (e.target.closest('input[type="range"]')) return; // 滑動條忽略
        if (diffX < -100) onClose(); // 右滑 (手指往右) -> 返回/關閉
    };

    return { onTouchStart, onTouchEnd };
};

function getModalTitle(type) {
    switch(type) {
        case 'group': return '團體';
        case 'member': return '成員';
        case 'series': return '系列';
        case 'batch': return '批次';
        case 'card': return '圖鑑';
        case 'channel': return '通路';
        case 'type': return '子類';
        default: return '';
    }
}

const getOwnedQuantity = (invList, cardId) => {
    return (invList || [])
        .filter(i => String(i.cardId) === String(cardId) && (!i.sellPrice || i.sellPrice <= 0))
        .reduce((s, i) => s + Number(i.quantity), 0);
};

// --- 3. 基礎 UI 組件 ---
const Modal = ({ title, onClose, children, footer, className = "max-w-lg", fullScreen = false, headerAction, mobileFullScreen = false }) => {
  const swipeHandlers = useSwipeToClose(onClose);
  return (
  <div className={`fixed inset-0 z-[150] bg-black/30 backdrop-blur-sm flex items-center justify-center animate-fade-in ${mobileFullScreen ? 'p-0 sm:p-4' : 'p-4'}`} onClick={onClose} {...swipeHandlers}>
    <div 
      className={`bg-white/90 backdrop-blur-xl border border-white/50 w-full shadow-2xl overflow-hidden flex flex-col transition-all ${fullScreen ? 'fixed inset-0 rounded-none h-full max-h-full' : mobileFullScreen ? `h-full sm:h-auto sm:max-h-[90vh] rounded-none sm:rounded-2xl ${className}` : `rounded-2xl max-h-[90vh] ${className}`}`} 
      onClick={e => e.stopPropagation()}
    >
      <div className="px-4 py-3 border-b border-gray-200/50 flex justify-between items-center bg-white/50 backdrop-blur-sm flex-shrink-0 z-10">
        <div className="font-bold text-lg text-gray-800 truncate pr-2 flex-1 flex items-center">
            {title}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
            {headerAction}
            <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 transition-colors"><X className="w-6 h-6 text-gray-500" /></button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto no-scrollbar relative bg-gray-50/50">
        {children}
      </div>
      {footer && (
        <div className="px-4 py-3 border-t border-gray-200/50 bg-white/50 backdrop-blur-sm flex justify-end gap-3 flex-shrink-0 z-10 safe-area-bottom">
          {footer}
        </div>
      )}
    </div>
  </div>
  );
};

const FormCapsuleSelect = ({ label, options, value, onChange, renderOption, allowCustom = false, placeholder = "自訂...", multiple = false, onOptionEdit, onOptionDelete }) => {
  const [customValue, setCustomValue] = useState('');
  const [isCustomMode, setIsCustomMode] = useState(false);

  const currentValuesArray = Array.isArray(value) ? value : (value ? [value] : []);

  const handleCustomSubmit = () => {
    if (customValue.trim()) {
      if (multiple) {
          onChange([...currentValuesArray, customValue.trim()]);
      } else {
          onChange(customValue.trim());
      }
      setIsCustomMode(false);
      setCustomValue('');
    }
  };

  const handleSelect = (optValue) => {
      if (multiple) {
          if (currentValuesArray.includes(optValue)) {
              onChange(currentValuesArray.filter(v => v !== optValue));
          } else {
              onChange([...currentValuesArray, optValue]);
          }
      } else {
          if (value === optValue) {
              onChange('');
          } else {
              onChange(optValue);
          }
          setIsCustomMode(false);
      }
  };

  // 🌟 新增：雙擊修改與刪除邏輯
  const handleDoubleClick = (optValue) => {
      if (!onOptionEdit && !onOptionDelete) return;
      const newName = window.prompt(`重新命名「${optValue}」\n(若要刪除請清空內容並按下確定)：`, optValue);
      
      if (newName === null) return; // 按下取消
      
      if (newName.trim() === '') {
          if (onOptionDelete) onOptionDelete(optValue);
      } else if (newName.trim() !== optValue) {
          if (onOptionEdit) onOptionEdit(optValue, newName.trim());
      }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-center">
         <label className="text-xs font-bold text-gray-600 block">{label}</label>
         {multiple && <span className="text-[10px] text-indigo-600 bg-indigo-50 px-1.5 rounded">多選模式</span>}
      </div>
      <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar items-center">
        {(options || []).map((opt) => {
          const optValue = typeof opt === 'object' ? opt.id : opt;
          const isSelected = multiple ? currentValuesArray.includes(optValue) : value === optValue;
          return (
            <button
              key={optValue}
              onClick={() => handleSelect(optValue)}
              onDoubleClick={() => handleDoubleClick(optValue)} // 🌟 綁定雙擊事件
              title={onOptionEdit ? "雙擊可修改或刪除" : ""} // 🌟 滑鼠游標提示
              className={`
                flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-all flex items-center gap-1.5 select-none
                ${isSelected 
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm ring-1 ring-indigo-200' 
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50'}
              `}
            >
              {renderOption ? renderOption(opt) : (typeof opt === 'object' ? opt.name : opt)}
              {isSelected && <Check className="w-3 h-3" />}
            </button>
          );
        })}
        
        {allowCustom && (
          <div className={`flex-shrink-0 ${isCustomMode ? 'w-32' : 'w-auto'} transition-all duration-200`}>
             {isCustomMode ? (
               <div className="flex items-center gap-1">
                 <input 
                    autoFocus
                    value={customValue}
                    onChange={(e) => setCustomValue(e.target.value)}
                    onBlur={handleCustomSubmit}
                    onKeyDown={(e) => e.key === 'Enter' && handleCustomSubmit()}
                    placeholder={placeholder}
                    className="w-full text-xs px-2 py-1.5 border rounded-full outline-none focus:border-indigo-500"
                 />
               </div>
             ) : (
               <button 
                onClick={() => setIsCustomMode(true)}
                className={`
                  px-3 py-1.5 rounded-full text-xs font-medium border border-dashed border-gray-300 
                  text-gray-400 hover:text-indigo-600 hover:border-indigo-400 hover:bg-indigo-50 flex items-center gap-1
                  ${!(options || []).some(o => (typeof o === 'object' ? o.id === value : o === value)) && value && !multiple ? 'bg-indigo-50 border-indigo-600 text-indigo-700' : ''}
                `}
               >
                 <Plus className="w-3 h-3" />
                 {!(options || []).some(o => (typeof o === 'object' ? o.id === value : o === value)) && value && !multiple ? value : '自訂'}
               </button>
             )}
          </div>
        )}
      </div>
    </div>
  );
};

// --- 4. 列表項目組件 ---
const MemberItem = ({ member, isSelected, onClick, onLongPress, onDoubleClick }) => {
  const bind = useLongPress(() => onLongPress(member), onClick);
  return (
    <div 
      {...bind}
      onDoubleClick={onDoubleClick}
      className="flex flex-col items-center gap-1 cursor-pointer min-w-[64px] select-none active:scale-95 transition-transform"
    >
      <div className={`w-16 h-16 rounded-full overflow-hidden border-2 transition-all ${isSelected ? 'border-indigo-600 scale-105 shadow-md' : 'border-transparent'}`}>
        <img src={member.image} className="w-full h-full object-cover pointer-events-none" alt={member.name} />
      </div>
      <span className={`text-xs font-medium ${isSelected ? 'text-indigo-600' : 'text-gray-600'}`}>{member.name}</span>
    </div>
  );
};

const SeriesItem = ({ series, isSelected, onClick, onLongPress, onDoubleClick }) => {
  const bind = useLongPress(() => onLongPress(series), onClick);
  return (
    <div 
      {...bind}
      onDoubleClick={onDoubleClick}
      className={`relative w-28 h-28 aspect-square rounded-lg overflow-hidden cursor-pointer flex-shrink-0 group select-none ${isSelected ? 'ring-2 ring-indigo-500' : ''}`}
    >
        {/* 🌟 限制最大生成寬度為 120px，強制伺服器輸出極小 KB 數的縮圖 */}
        {series.image ? (
            <Image src={series.image} alt={series.name} fill sizes="120px" className="object-cover brightness-75 group-hover:brightness-100 transition-all pointer-events-none" unoptimized={true} />
        ) : (
            <div className="w-full h-full bg-gray-200 flex items-center justify-center">
                <ImageIcon className="w-8 h-8 text-gray-400" />
            </div>
        )}
        <div className="absolute inset-0 flex flex-col justify-end p-2 bg-gradient-to-t from-black/70 to-transparent">
            <span className="text-white font-bold text-sm truncate w-full">{series.name}</span>
            {series.shortName && <span className="text-white/70 text-[10px]">{series.shortName}</span>}
        </div>
    </div>
  );
};

const BatchItem = ({ batch, isSelected, onClick, onLongPress, onDoubleClick }) => {
  const bind = useLongPress(() => onLongPress(batch), onClick);
  return (
    <div 
      {...bind}
      onDoubleClick={onDoubleClick}
      className={`relative w-24 h-24 aspect-square rounded-lg overflow-hidden cursor-pointer flex-shrink-0 border select-none ${isSelected ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 bg-white'}`}
    >
        {/* 🌟 限制最大生成寬度為 100px */}
        {batch.image ? (
            <Image src={batch.image} alt={batch.name || 'batch'} fill sizes="100px" className="object-cover opacity-90 hover:opacity-100 pointer-events-none" unoptimized={true} />
        ) : (
             <div className="w-full h-full bg-gray-100 flex items-center justify-center">
                <Package className="w-6 h-6 text-gray-300" />
            </div>
        )}
       <div className="absolute inset-0 flex items-end p-1 bg-gradient-to-t from-black/60 via-transparent to-transparent">
            <span className="text-xs font-bold text-white line-clamp-2 w-full leading-tight">{batch.name}</span>
        </div>
    </div>
  );
};

const FilterTagItem = ({ text, isSelected, onClick, onLongPress, onDoubleClick }) => {
  const bind = useLongPress(() => onLongPress(text), onClick);
  return (
    <button 
        {...bind}
        onDoubleClick={onDoubleClick}
        className={`px-3 py-1 text-xs rounded-full whitespace-nowrap border select-none transition-all ${isSelected ? 'bg-indigo-600 border-indigo-600 text-white font-bold' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'}`}
    >
        {text}
    </button>
  );
};

const SubunitTagItem = ({ text, isSelected, onClick, onLongPress }) => {
  const bind = useLongPress(() => onLongPress && onLongPress(), onClick);
  return (
    <button
        {...bind}
        className={`px-4 py-1.5 text-xs rounded-full border transition-all whitespace-nowrap select-none ${isSelected ? 'bg-indigo-600 text-white border-indigo-600 font-bold shadow-sm' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
    >
        {text}
    </button>
  );
};

// --- 5. 表單與模態框 ---
function InventoryForm({ initialData = {}, onSave, sourceOptions = ['社團', '韓拍', 'Mercari', '推特', '蝦皮'] , uniqueSources, onRenameSource, onDeleteSource, albums = [] }) {
    const isEdit = !!initialData.id;
    const isBulk = !!initialData.bulkRecordId;
    const initialSellDate = initialData.sellDate || (initialData.sellPrice > 0 ? initialData.buyDate : new Date().toISOString().split('T')[0]);

    const [form, setForm] = useState({
        buyDate: new Date().toISOString().split('T')[0],
        buyPrice: '',
        sellPrice: '',
        quantity: 1,
        source: '',
        condition: '無損',
        status: '到貨',
        albumId: '',
        albumStatus: '未拆',
        albumQuantity: 0,
        note: '',
        ...initialData,
        sellDate: initialSellDate
    });

    // 🌟 確保表單擁有一個穩定的 ID (修正版)
    // 使用 useRef 直接鎖定 ID，若 initialData 沒有 ID 則生成一個，並在組件生命週期內保持不變
    const dataIdRef = useRef(initialData.id || `inv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
    
    // 監聽 initialData.id 變化，如果外部傳入了新的 ID (例如儲存後)，同步更新 ref
    useEffect(() => {
        if (initialData.id) dataIdRef.current = initialData.id;
    }, [initialData.id]);

    const timerRef = useRef(null);

    const syncToParent = (nextForm) => {
        if (timerRef.current) clearTimeout(timerRef.current);
        
        // 🌟 加入防抖 (Debounce) 0.5秒，避免每打一個字就觸發儲存
        timerRef.current = setTimeout(() => {
            onSave({
                ...nextForm,
                id: dataIdRef.current,
                _originalId: dataIdRef.current, // 🌟 修正：使用當前最新的 ID 作為原始 ID，避免因 ID 更新導致找不到舊資料
                buyPrice: Number(nextForm.buyPrice) || 0,
                sellPrice: Number(nextForm.sellPrice) || 0,
                quantity: Number(nextForm.quantity) || 1,
                albumQuantity: Number(nextForm.albumQuantity) || 0
            }, (newId) => {
                if (newId) dataIdRef.current = newId;
            });
        }, 500);
    };

    useEffect(() => {
        const initialForm = { 
            ...form, 
            condition: form.condition || '無損',
            status: form.status || '到貨'
        };
        setForm(initialForm);

        if (!isEdit && !isBulk) {
            syncToParent(initialForm);
        }
        
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, []);

    const handleChange = (key, value) => {
        let nextForm = { ...form, [key]: value };
        if (key === 'sellPrice' && Number(value) > 0 && !nextForm.sellDate) {
            nextForm.sellDate = new Date().toISOString().split('T')[0];
        }
        setForm(nextForm);
        syncToParent(nextForm);
    };

    return (
        <div className="space-y-6 px-1 py-2 pb-6">
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="text-xs font-bold text-gray-500 mb-1.5 block">購買日期</label>
                    <input type="date" disabled={isBulk} value={form.buyDate} onChange={e => handleChange('buyDate', e.target.value)} className={`w-full border p-3 rounded-xl bg-gray-50 focus:bg-white transition-colors outline-none focus:ring-2 focus:ring-indigo-100 ${isBulk ? 'opacity-60 cursor-not-allowed' : ''}`} />
                </div>
                <div>
                    <label className="text-xs font-bold text-gray-500 mb-1.5 block">數量</label>
                    <input type="number" min="1" disabled={isBulk} value={form.quantity} onChange={e => handleChange('quantity', e.target.value)} className={`w-full border p-3 rounded-xl bg-gray-50 focus:bg-white transition-colors outline-none focus:ring-2 focus:ring-indigo-100 ${isBulk ? 'opacity-60 cursor-not-allowed' : ''}`} />
                </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
                 <div>
                    <label className="text-xs font-bold text-gray-500 mb-1.5 block">卡況</label>
                     <div className="relative">
                        <select 
                            value={form.condition|| ''} 
                            onChange={e => handleChange('condition', e.target.value)} 
                            className="w-full border p-3 rounded-xl bg-gray-50 focus:bg-white transition-colors outline-none focus:ring-2 focus:ring-indigo-100 appearance-none text-sm"
                        >
                            <option value="無損">無損</option>
                            <option value="微損">微損</option>
                            <option value="有損">有損</option>
                            <option value="嚴重受損">嚴重受損</option>
                        </select>
                         <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-500">
                            <ChevronDown className="w-4 h-4" />
                        </div>
                    </div>
                </div>
                <div>
                    <label className="text-xs font-bold text-gray-500 mb-1.5 block">狀態</label>
                     <div className={`relative ${isBulk ? 'opacity-60 pointer-events-none' : ''}`}>
                        <select 
                            disabled={isBulk}
                            value={form.status} 
                            onChange={e => handleChange('status', e.target.value)} 
                            className={`w-full border p-3 rounded-xl bg-gray-50 focus:bg-white transition-colors outline-none focus:ring-2 focus:ring-indigo-100 appearance-none text-sm ${isBulk ? 'cursor-not-allowed' : ''}`}
                        >
                            <option value="未發貨">未發貨</option>
                            <option value="囤貨">囤貨</option>
                            <option value="到貨">到貨</option>
                        </select>
                         <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-500">
                            <ChevronDown className="w-4 h-4" />
                        </div>
                    </div>
                </div>
            </div>

            <div className="col-span-2">
            <FormCapsuleSelect 
                label="來源"
                options={uniqueSources || []}
                value={form.source || ''}
                onChange={val => handleChange('source', val)}
                allowCustom={true}
                placeholder="輸入新來源..."
                onOptionEdit={onRenameSource}
                onOptionDelete={onDeleteSource}
            />
            </div>

            <div className="grid grid-cols-2 gap-3 sm:gap-4 pt-1 sm:pt-2">
                <div className="bg-green-50/50 p-3 sm:p-4 rounded-2xl flex flex-col justify-between h-24 sm:h-28 relative group border border-green-100/50 hover:border-green-200 transition-colors">
                    <div className="flex justify-between items-center mb-1">
                        <label className="text-[9px] sm:text-[10px] font-bold text-green-600 uppercase tracking-wider">售出價格</label>
                         {form.sellPrice > 0 && (
                            <input 
                                type="date" 
                                value={form.sellDate} 
                                onChange={e => handleChange('sellDate', e.target.value)} 
                                className="bg-transparent text-[9px] sm:text-[10px] text-green-600 font-bold outline-none border-b border-green-200 w-16 sm:w-20"
                            />
                        )}
                    </div>
                    <div className="flex items-baseline">
                        <span className="text-base sm:text-lg text-green-600 font-bold mr-1">$</span>
                        <input 
                            type="number" 
                            placeholder="0" 
                            step="50"
                            value={form.sellPrice} 
                            onChange={e => handleChange('sellPrice', e.target.value)} 
                            className="w-full bg-transparent text-2xl sm:text-4xl font-black text-green-600 outline-none placeholder-green-200"
                        />
                    </div>
                </div>

                <div className="bg-red-50/50 p-3 sm:p-4 rounded-2xl flex flex-col justify-between h-24 sm:h-28 relative group border border-red-100/50 hover:border-red-200 transition-colors">
                    <div className="flex justify-end">
                        <label className="text-[9px] sm:text-[10px] font-bold text-red-600 uppercase tracking-wider">購入價格</label>
                    </div>
                    <div className="flex items-baseline justify-end">
                        <span className="text-base sm:text-lg text-red-600 font-bold mr-1">$</span>
                        <input 
                            type="number" 
                            disabled={isBulk}
                            placeholder="0" 
                            step="50"
                            value={form.buyPrice} 
                            onChange={e => handleChange('buyPrice', e.target.value)} 
                            className={`w-full bg-transparent text-2xl sm:text-4xl font-black text-red-600 outline-none text-right placeholder-red-200 ${isBulk ? 'opacity-60 cursor-not-allowed' : ''}`}
                        />
                    </div>
                </div>
            </div>

            <div className="bg-gray-50 p-3 rounded-xl border border-gray-100 space-y-2">
                <div className="flex justify-between items-center">
                     <label className="text-xs font-bold text-gray-500 flex items-center gap-1"><Disc className="w-3 h-3" /> 搭配專輯</label>
                     {form.albumQuantity > 0 && <span className="text-[10px] bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded font-bold">含專</span>}
                </div>
                <div className="grid grid-cols-[1fr_auto_auto] gap-2">
                     <div className="relative">
                         <select 
                            value={form.albumId || ''} 
                            onChange={e => handleChange('albumId', e.target.value)}
                            className="w-full border p-2 rounded-lg bg-white text-xs outline-none appearance-none"
                         >
                            <option value="">選擇專輯...</option>
                            {albums.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                         </select>
                         <ChevronDown className="w-3 h-3 text-gray-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                     </div>
                     <button 
                        type="button"
                        onClick={() => handleChange('albumStatus', form.albumStatus === '未拆' ? '空專' : '未拆')}
                        className={`px-2 py-1 rounded-lg border text-xs font-bold whitespace-nowrap ${form.albumStatus === '未拆' ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-gray-100 text-gray-500 border-gray-200'}`}
                     >
                        {form.albumStatus}
                     </button>
                     <div className="flex items-center border rounded-lg bg-white overflow-hidden">
                        {/* 🌟 移除減少按鈕，只保留增加按鈕 (上下鍵只保留一個) */}
                        <input 
                            type="number" 
                            value={form.albumQuantity} 
                            onChange={e => handleChange('albumQuantity', Math.max(0, Number(e.target.value)))}
                            className="w-8 text-center text-xs font-bold outline-none appearance-none border-x h-full" 
                        />
                        <button type="button" onClick={() => handleChange('albumQuantity', (Number(form.albumQuantity)||0) + 1)} className="px-2 hover:bg-gray-50 text-gray-500 h-full flex items-center"><Plus className="w-3 h-3" /></button>
                     </div>
                </div>
            </div>

            <div>
                <label className="text-[11px] sm:text-xs font-bold text-gray-500 mb-1 block">備註</label>
                <input type="text" placeholder="卡況詳細或其他備註..." value={form.note} onChange={e => handleChange('note', e.target.value)} className="w-full border p-2.5 sm:p-3 rounded-xl bg-gray-50 focus:bg-white transition-colors outline-none focus:ring-2 focus:ring-indigo-100 text-xs sm:text-sm" />
            </div>
        </div>
    );
}

function OptionManageModal({ type, data, onClose, onRename, onDelete, onSortChange, initialSortOrder }) {
    const [newName, setNewName] = useState(data.name || data.value);
    const [newSortOrder, setNewSortOrder] = useState(initialSortOrder);

    const handleSave = () => {
        if (onRename) onRename(newName);
        if (onSortChange && newSortOrder !== initialSortOrder) onSortChange(newSortOrder);
        onClose();
    };

    return (
        <Modal title={`管理: ${data.name || data.value}`} onClose={onClose} className="max-w-sm" footer={
            <div className="flex justify-between items-center w-full">
                <button 
                    onClick={() => { 
                        if(confirm('確定要刪除嗎？相關資料的關聯將會被移除。')) {
                            onDelete();
                            onClose();
                        }
                    }}
                    className="px-4 py-2 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 flex items-center gap-1 text-sm font-bold"
                >
                    <Trash2 className="w-4 h-4" /> 刪除
                </button>
                <div className="flex gap-2 justify-end ml-2 flex-1">
                    <button onClick={onClose} className="flex-1 py-2 rounded-lg border text-gray-500 hover:bg-gray-100">取消</button>
                    <button 
                        onClick={handleSave}
                        className="flex-1 py-2 rounded-lg bg-indigo-600 text-white font-bold"
                    >
                        儲存
                    </button>
                </div>
            </div>
        }>
            <div className="space-y-4 pt-2">
                <div>
                    <label className="text-xs font-bold text-gray-500 mb-1 block">重新命名</label>
                    <input 
                        type="text" 
                        value={newName} 
                        onChange={e => setNewName(e.target.value)} 
                        className="w-full border p-3 rounded-lg"
                    />
                </div>
                {initialSortOrder !== undefined && (
                    <div>
                        <label className="text-xs font-bold text-gray-500 mb-1 block">排序 (數字越小越前面)</label>
                        <input 
                            type="number" 
                            value={newSortOrder} 
                            onChange={e => setNewSortOrder(Number(e.target.value))} 
                            className="w-full border p-3 rounded-lg"
                        />
                    </div>
                )}
            </div>
        </Modal>
    );
}

function SeriesFilterModal({ 
    visible, onClose, 
    seriesTypes, selectedSeriesType, setSeriesType,
    series, selectedSeries, setSeries,
    batches, selectedBatches, setBatches
}) {
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
                     )
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
                        )
                    })}
                </div>
            </div>
        );
    };

    return (
        <Modal title="系列與版本篩選" onClose={onClose} className="max-w-md">
             <div className="p-2">
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
}

function CardDetailModal({ currentGroupId, cards, card: initialCard, onClose, inventory, setInventory, sales, setSales, customLists, setCustomLists, groups, members, series, batches, channels, types, setCards, onEdit, onOpenBulkRecord, uniqueSources, onRenameSource, onDeleteSource, bulkRecords, setBulkRecords }) {
    const [activeModal, setActiveModal] = useState(null); 
    const [tempInvData, setTempInvData] = useState(null);
    const saleFocusRef = useRef(null);
    const swipeHandlers = useSwipeToClose(onClose);

    const SALE_COLORS = [
        { id: 'black', class: 'bg-black/70', display: 'bg-gray-800' },
        { id: 'red', class: 'bg-red-500/80', display: 'bg-red-500' },
        { id: 'orange', class: 'bg-orange-500/80', display: 'bg-orange-500' },
        { id: 'green', class: 'bg-green-600/80', display: 'bg-green-600' },
        { id: 'blue', class: 'bg-blue-500/80', display: 'bg-blue-500' },
        { id: 'purple', class: 'bg-purple-500/80', display: 'bg-purple-500' },
    ];

    const card = cards.find(c => String(c.id) === String(initialCard.id)) || initialCard;

    const memberName = members.find(m => String(m.id) === String(card.memberId))?.name;
    const groupName = groups.find(g => String(g.id) === String(card.groupId))?.name;
    
    const cardSeries = (series || []).find(s => String(s.id) === String(card.seriesId));
    const seriesName = cardSeries?.shortName || cardSeries?.name;
    const cardBatch = (batches || []).find(b => String(b.id) === String(card.batchId));
    
    const effectiveType = card.type;
    const typeObj = (types || []).find(t => String(t.id) === String(effectiveType) || t.name === effectiveType);
    const displayType = typeObj ? (typeObj.shortName || typeObj.name) : effectiveType;
    
    const effectiveChannelId = card.channel;
    const channelObj = (channels || []).find(c => String(c.id) === String(effectiveChannelId) || c.name === effectiveChannelId);
    const displayChannel = channelObj ? (channelObj.shortName || channelObj.name) : effectiveChannelId;
    
    const batchNumber = cardBatch?.batchNumber;
    const channelAndBatch = [displayChannel, batchNumber].filter(Boolean).join('');
    const displayTitle = [seriesName, channelAndBatch, displayType].filter(Boolean).join(' ');

    const myInventory = (inventory || [])
        .filter(i => String(i.cardId) === String(card.id))
        .sort((a, b) => new Date(b.buyDate || 0) - new Date(a.buyDate || 0));
        
    const currentSale = sales.find(s => String(s.cardId) === String(card.id)); 

    const totalQty = getOwnedQuantity(inventory, card.id); 
    // 1. 先濾出還沒售出的庫存
    const validInv = myInventory.filter(i => (!i.sellPrice || i.sellPrice <= 0));
    // 2. 計算總花費金額
    const totalAmount = validInv.reduce((acc, curr) => acc + Number(curr.buyPrice || 0), 0);
    // 3. 計算總擁有張數
    const totalValidQty = validInv.reduce((acc, curr) => acc + (Number(curr.quantity) || 1), 0);
    // 4. 總金額 / 總張數 = 真實均價
    const avgPrice = totalValidQty > 0 ? Math.round(totalAmount / totalValidQty) : 0;

    // 🌟 篩選專輯：若成員有分隊，只顯示該分隊的專輯
    const cardMember = members.find(m => m.id === card.memberId);
    const albums = useMemo(() => (series || []).filter(s => {
        if (s.type !== '專輯' || s.groupId !== card.groupId) return false;
        return !cardMember?.subunit || s.subunit === cardMember.subunit;
    }), [series, card.groupId, cardMember]);

    // 🌟 偵測重複的盤收資料 (同一個 bulkRecordId 出現多次)
    const duplicateBulkItems = useMemo(() => {
        const bulkIds = myInventory.map(i => i.bulkRecordId).filter(Boolean);
        const uniqueBulkIds = new Set(bulkIds);
        if (bulkIds.length === uniqueBulkIds.size) return [];
        
        const seen = new Set();
        const repeatedIds = new Set();
        bulkIds.forEach(id => {
            if (seen.has(id)) repeatedIds.add(id);
            seen.add(id);
        });
        
        return Array.from(repeatedIds);
    }, [myInventory]);

    const handleCleanupDuplicates = async () => {
        if (!confirm(`偵測到 ${duplicateBulkItems.length} 組重複的盤收資料，是否自動保留最新的一筆並刪除其餘重複項？`)) return;

        let idsToDelete = [];
        const newInventory = [...inventory];

        duplicateBulkItems.forEach(bulkId => {
            const items = myInventory.filter(i => i.bulkRecordId === bulkId);
            // 排序：保留 ID 比較大的 (通常是後建立的)
            items.sort((a, b) => b.id.localeCompare(a.id));
            
            const toRemove = items.slice(1);
            
            toRemove.forEach(item => {
                idsToDelete.push(item.id);
                const idx = newInventory.findIndex(i => i.id === item.id);
                if (idx !== -1) newInventory.splice(idx, 1);
            });
        });

        setInventory(newInventory);
        if (idsToDelete.length > 0) {
            await supabase.from('ui_inventory').delete().in('id', idsToDelete);
            alert(`已刪除 ${idsToDelete.length} 筆重複資料`);
        }
    };

    // 🌟 升級版：確保批量加入的重複卡片都會成為獨立紀錄
  const handleSaveInventory = async (data, callback) => {
      const isArray = Array.isArray(data);
      const items = isArray ? data : [data];
      
      const newItems = items.map(item => ({
          ...item,
          // 🌟 如果是剛選進來沒有實體 ID 的，強制給予全新獨立 ID
          id: (!item.id || String(item.id).startsWith('temp_') || String(item.id).startsWith('sel_')) 
              ? `inv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` 
              : item.id,
          quantity: Number(item.quantity) || 1 // 🌟 允許修改數量，若無則預設為 1
      }));

      setInventory(prev => {
          let next = [...prev];
          newItems.forEach(itemWithMeta => {
              // 🌟 拆解出原始 ID 和乾淨的資料物件
              const { _originalId, ...newItem } = itemWithMeta;
              // 🌟 強化尋找邏輯：優先用原始 ID 找，找不到才用新 ID 找
              const idToFind = _originalId || newItem.id;
              
              // 🌟 修正：轉成 String 比對，避免 ID 類型不一致 (例如 number vs string) 導致找不到而重複新增
              let idx = next.findIndex(i => String(i.id) === String(idToFind));
              
              // 🌟 雙重保險：如果用原始 ID 找不到 (可能 ID 已經變更)，再試著用新 ID 找一次
              if (idx === -1 && newItem.id) {
                  idx = next.findIndex(i => String(i.id) === String(newItem.id));
              }

              if (idx !== -1) next[idx] = newItem;
              else next.push(newItem);
          });
          return next;
      });

      // 🌟 移除 _originalId 避免寫入資料庫報錯
      const dbItems = newItems.map(({ _originalId, ...rest }) => toSnakeCase(rest));
      const { error } = await supabase.from('ui_inventory').upsert(dbItems);
      if (error) console.error("Error saving inventory:", error);

      // 🌟 同步更新盤收紀錄內的對應項目 (售價、狀態等)
      if (bulkRecords && setBulkRecords) {
          const updatesByBulkId = {};
          let hasBulkUpdates = false;

          newItems.forEach(item => {
              if (item.bulkRecordId) {
                  if (!updatesByBulkId[item.bulkRecordId]) updatesByBulkId[item.bulkRecordId] = [];
                  updatesByBulkId[item.bulkRecordId].push(item);
                  hasBulkUpdates = true;
              }
          });

          if (hasBulkUpdates) {
              setBulkRecords(prev => prev.map(record => {
                  if (updatesByBulkId[record.id]) {
                      const itemsToUpdate = updatesByBulkId[record.id];
                      const nextItems = (record.items || []).map(ri => {
                          // 🌟 修正：轉成 String 比對，確保能正確對應到盤收內的項目
                          const updatedItem = itemsToUpdate.find(u => String(u.id) === String(ri.id));
                          if (updatedItem) {
                              return { ...ri, sellPrice: updatedItem.sellPrice, sellDate: updatedItem.sellDate, condition: updatedItem.condition, status: updatedItem.status, note: updatedItem.note };
                          }
                          return ri;
                      });
                      // 背景同步更新資料庫
                      supabase.from('bulk_records').update({ items: nextItems }).eq('id', record.id).then();
                      return { ...record, items: nextItems };
                  }
                  return record;
              }));
          }
      }

      // 🌟 回傳新產生的 ID 給表單
      if (callback && newItems.length > 0) {
          callback(newItems[0].id);
      }
  };

    const handleUpdateSale = async (key, value) => {
        let payloadToSave;
        setSales(prev => {
            const existing = prev.find(s => String(s.cardId) === String(card.id));
            if (existing) {
                payloadToSave = { ...existing, [key]: value };
                return prev.map(s => String(s.cardId) === String(card.id) ? payloadToSave : s);
            } else {
                payloadToSave = { id: Date.now().toString(), cardId: card.id, [key]: value, date: new Date().toISOString().split('T')[0], quantity: 1, price: 0, color: 'bg-black/70' };
                return [...prev, payloadToSave];
            }
        });
        
        // 💾 儲存到 Supabase
        setTimeout(async () => {
            if(payloadToSave) await supabase.from('ui_sales').upsert(toSnakeCase(payloadToSave));
        }, 0);
    };
    
    const adjustSalePrice = (amount) => {
        const currentPrice = Number(currentSale?.price) || 0;
        const newPrice = Math.max(0, currentPrice + amount);
        handleUpdateSale('price', newPrice);
    };

    const handleDeleteInventory = async (invId) => {
        const targetItem = inventory.find(i => i.id === invId);
        setInventory(prev => prev.filter(i => i.id !== invId));
        setActiveModal(null);
        setTempInvData(null);
        // 💾 刪除 Supabase 紀錄
        await supabase.from('ui_inventory').delete().eq('id', invId);
        
        // 🌟 如果這筆資料來自盤收/套收，同步移除父級紀錄內的該項目
        if (targetItem && targetItem.bulkRecordId && setBulkRecords) {
            setBulkRecords(prev => prev.map(record => {
                if (record.id === targetItem.bulkRecordId) {
                    const newItems = (record.items || []).filter(item => String(item.id) !== String(invId));
                    supabase.from('bulk_records').update({ items: newItems }).eq('id', record.id).then();
                    return { ...record, items: newItems };
                }
                return record;
            }));
        }
    };

    const handleAddToList = async (listId, note) => {
        const targetList = customLists.find(l => l.id === listId);
        const newItems = [...(targetList.items || []), { cardId: card.id, note }];
        setCustomLists(prev => prev.map(l => l.id === listId ? { ...l, items: newItems } : l));
        setActiveModal(null);
        alert("已加入收藏冊");
        // 💾 儲存到 Supabase
        await supabase.from('custom_lists').update({ items: newItems }).eq('id', listId);
    };

    const toggleWishlist = async () => {
        const newVal = !card.isWishlist;
        setCards(prev => prev.map(c => c.id === card.id ? { ...c, isWishlist: newVal } : c));
        // 💾 儲存到 Supabase
        await supabase.from('ui_cards').update({ is_wishlist: newVal }).eq('id', card.id);
    };

    const openEditInv = (inv) => {
        setTempInvData(inv);
        setActiveModal('editInv');
    };
    
    useEffect(() => {
        if(activeModal === 'focusSell' && saleFocusRef.current) {
            saleFocusRef.current.focus();
            setActiveModal(null);
        }
    }, [activeModal]);

    return (
        <div className="fixed inset-0 z-[250] bg-gray-50/50 backdrop-blur-xl flex flex-col animate-fade-in" {...swipeHandlers}>
            <div className="px-4 py-3 border-b border-gray-200/50 flex items-center justify-between bg-white/80 backdrop-blur-md z-10 sticky top-0">
                <button onClick={onClose} className="p-2 -ml-2 rounded-full hover:bg-gray-100"><ArrowLeft className="w-6 h-6 text-gray-700" /></button>
                <div className="font-bold text-lg">卡片詳情</div>
                <button onClick={() => { onClose(); onEdit(card); }} className="p-2 -mr-2 text-gray-500 hover:text-indigo-600"><Edit2 className="w-5 h-5" /></button>
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar bg-transparent">
                <div className="bg-white/60 p-6 mb-2 text-center border-b border-gray-200/50 shadow-sm backdrop-blur-sm">
                    <div className="w-40 aspect-[2/3] mx-auto bg-gray-100 rounded-xl overflow-hidden border shadow-lg mb-4 relative">
                        {/* 🌟 詳情頁：加入 unoptimized 直接讀取最原始、最高畫質的無損圖片 */}
                        <Image src={card.image} alt="卡片詳情" fill priority unoptimized className="object-cover" unoptimized={true}/>
                    </div>
                    <div className="text-xs font-bold text-indigo-600 uppercase tracking-widest mb-1">{groupName} · {memberName}</div>
                    <h2 className="text-xl font-bold text-gray-900 leading-snug mb-2">{displayTitle || '未命名卡片'}</h2>
                    {cardBatch?.name && <div className="text-sm text-gray-400">{cardBatch.name}</div>}
                    
                    <div className="flex justify-center gap-3 mt-4">
                        {totalQty > 0 ? (
                            <span className="text-sm font-bold text-green-700 bg-green-50 px-3 py-1 rounded-full border border-green-100">
                                持有 {totalQty} 張
                            </span>
                        ) : (
                            <span className="text-sm font-bold text-gray-400 bg-gray-100 px-3 py-1 rounded-full">未擁有</span>
                        )}
                        {!!card.isWishlist && (
                            <span className="text-sm font-bold text-pink-600 bg-pink-50 px-3 py-1 rounded-full border border-pink-100 flex items-center gap-1">
                                <Heart className="w-3 h-3 fill-current" /> 許願中
                            </span>
                        )}
                        {currentSale && currentSale.quantity >= 1 && (
                             <span className="text-sm font-bold text-blue-600 bg-blue-50 px-3 py-1 rounded-full border border-blue-100 flex items-center gap-1">
                                <Coins className="w-3 h-3 fill-current" /> 販售中
                            </span>
                        )}
                    </div>
                </div>

                <div className="p-4 pb-24">
                    <div className="mb-6 bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                        <div className="flex justify-between items-center mb-2">
                             <div className="flex items-center gap-2">
                                <div className="bg-indigo-100 p-1.5 rounded-lg text-indigo-600">
                                    <TrendingUp className="w-4 h-4" />
                                </div>
                                <div className="font-bold text-gray-800 text-sm">販售</div>
                            </div>
                            <div className="flex gap-1.5">
                                {SALE_COLORS.map(c => (
                                    <button
                                        key={c.id}
                                        onClick={() => handleUpdateSale('color', c.class)}
                                        className={`w-4 h-4 rounded-full ${c.display} border-2 ${currentSale?.color === c.class || (!currentSale?.color && c.id === 'black') ? 'border-gray-400 scale-110' : 'border-transparent opacity-40 hover:opacity-100'} transition-all`}
                                        title="設定標籤顏色"
                                    />
                                ))}
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="flex-1">
                                <label className="text-[10px] text-gray-400 font-bold ml-1 mb-0.5 block">數量</label>
                                <input 
                                    type="number"
                                    min="0"
                                    placeholder="0"
                                    value={currentSale?.quantity || ''}
                                    onChange={(e) => handleUpdateSale('quantity', e.target.value)}
                                    className="w-full bg-gray-50 border-none rounded-lg py-2 px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-100 transition-all text-center"
                                />
                            </div>
                            <div className="flex-[2]">
                                <label className="text-[10px] text-green-500 font-bold ml-1 mb-0.5 block">價格</label>
                                <div className="flex items-center gap-1">
                                     <button onClick={() => adjustSalePrice(-50)} className="w-8 h-8 flex items-center justify-center bg-green-50 rounded-lg text-green-600 hover:bg-green-100 transition-colors flex-shrink-0">
                                         <Minus className="w-4 h-4" />
                                     </button>
                                     <div className="relative flex-1">
                                        <span className="absolute left-2 top-2 text-green-600 font-bold">$</span>
                                        <input 
                                            ref={saleFocusRef}
                                            type="number"
                                            min="0"
                                            placeholder="0"
                                            value={currentSale?.price || ''}
                                            onChange={(e) => handleUpdateSale('price', e.target.value)}
                                            className="w-full bg-white border-2 border-green-100 rounded-lg py-1.5 pl-5 pr-1 text-xl font-black text-green-600 outline-none focus:border-green-300 transition-all text-center placeholder-green-100"
                                        />
                                    </div>
                                    <button onClick={() => adjustSalePrice(50)} className="w-8 h-8 flex items-center justify-center bg-green-50 rounded-lg text-green-600 hover:bg-green-100 transition-colors flex-shrink-0">
                                         <Plus className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-between items-end mb-3 px-1">
                        <h3 className="font-bold text-gray-500 text-sm uppercase tracking-wider">交易紀錄</h3>
                        {avgPrice > 0 && <span className="text-xs text-gray-400 bg-white px-2 py-0.5 rounded border">均價 ${avgPrice}</span>}
                    </div>
                    
                    <div className="space-y-3">
                        {myInventory.map(inv => (
                            <div 
                                key={inv.id} 
                                onClick={() => openEditInv(inv)}
                                className="bg-white p-4 rounded-xl border shadow-sm flex justify-between items-center cursor-pointer active:scale-[0.99] transition-transform hover:border-indigo-300 group"
                            >
                                <div>
                                    <div className="text-sm font-bold text-gray-800 flex items-center gap-2">
                                        {inv.buyDate}
                                        {inv.sellPrice > 0 
                                            ? <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-bold">已售 x{inv.quantity}</span>
                                            : <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-bold">x{inv.quantity}</span>
                                        }
                                    </div>
                                    <div className="flex gap-2 mt-1 flex-wrap">
                                        {inv.status && (
                                            <span className={`text-[10px] px-1.5 rounded ${
                                                inv.status === '到貨' ? 'bg-green-50 text-green-600' :
                                                inv.status === '囤貨' ? 'bg-indigo-50 text-indigo-600' :
                                                inv.status === '未發貨' ? 'bg-pink-50 text-pink-600' :
                                                'bg-gray-50 text-gray-600'
                                            }`}>
                                                {inv.status}
                                            </span>
                                        )}
                                        {inv.source && <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 rounded">{inv.source}</span>}
                                        {inv.condition && <span className="text-[10px] bg-orange-50 text-orange-600 px-1.5 rounded">{inv.condition}</span>}
                                        <span className="text-xs text-gray-500">{inv.note || '無備註'}</span>
                                        {inv.albumQuantity > 0 && (
                                            <span className="text-[10px] bg-purple-50 text-purple-600 px-1.5 rounded border border-purple-100 flex items-center gap-1">
                                                <Disc className="w-3 h-3" /> {inv.albumStatus} x{inv.albumQuantity}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="text-right flex flex-col items-end gap-0.5">
                                    <div className="text-sm font-bold text-red-600">
                                        <span className="text-[10px] text-red-400 font-bold mr-1">買</span>
                                        ${inv.buyPrice}
                                    </div>
                                    {inv.sellPrice > 0 && (
                                        <div className="text-sm font-bold text-green-600">
                                            <span className="text-[10px] text-green-400 font-bold mr-1">賣</span>
                                            ${inv.sellPrice}
                                        </div>
                                    )}
                                </div>
                                <Edit2 className="w-4 h-4 text-gray-300 absolute right-2 top-2 opacity-0 group-hover:opacity-100" />
                            </div>
                        ))}
                        {myInventory.length === 0 && (
                            <div className="text-center py-10 text-gray-400 text-sm border-2 border-dashed border-gray-200 rounded-xl bg-gray-50/50">
                                尚未登錄任何庫存
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="border-t border-gray-200/50 bg-white/80 backdrop-blur-md p-4 pb-6 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] grid grid-cols-3 gap-3 z-20">
                <button 
                    onClick={toggleWishlist}
                    className={`flex flex-col items-center justify-center gap-1 py-2 rounded-xl transition-all active:scale-95 ${card.isWishlist ? 'bg-pink-50 text-pink-600 ring-1 ring-pink-200' : 'hover:bg-gray-50 text-gray-600'}`}
                >
                    <Heart className={`w-5 h-5 ${card.isWishlist ? 'fill-current' : ''}`} />
                    <span className="text-[10px] font-bold">想要</span>
                </button>
                
                <button 
                    onClick={() => setActiveModal('own')}
                    className="flex flex-col items-center justify-center gap-1 py-2 rounded-xl hover:bg-gray-50 text-gray-600 active:scale-95"
                >
                    <ShoppingBag className="w-5 h-5" />
                    <span className="text-[10px] font-bold">擁有</span>
                </button>
                
                <button 
                     onClick={() => setActiveModal('list')}
                    className="flex flex-col items-center justify-center gap-1 py-2 rounded-xl hover:bg-gray-50 text-gray-600 active:scale-95"
                >
                    <FolderPlus className="w-5 h-5" />
                    <span className="text-[10px] font-bold">收藏冊</span>
                </button>
            </div>

            {(activeModal === 'own' || activeModal === 'editInv') && (
                <Modal 
                    title={
                        <span className="flex items-center gap-2">
                            {activeModal === 'own' ? "新增購買紀錄" : "編輯紀錄"}
                            {tempInvData?.bulkRecordId && (
                                (() => {
                                    const parentBulkRecord = (bulkRecords || []).find(r => String(r.id) === String(tempInvData.bulkRecordId));
                                    const isParentSet = parentBulkRecord && (parentBulkRecord.isSetMode || parentBulkRecord.items?.some(i => i.isSet));
                                    return (
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onOpenBulkRecord && onOpenBulkRecord(tempInvData.bulkRecordId);
                                            }}
                                            className="text-[11px] bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full flex items-center gap-1 hover:bg-indigo-100 transition-colors tracking-normal font-bold"
                                        >
                                            <Package className="w-3 h-3" />
                                            {isParentSet ? '編輯套收' : '編輯盤收'}
                                        </button>
                                    );
                                })()
                            )}
                        </span>
                    } 
                    headerAction={
                        activeModal === 'editInv' && (
                            <button 
                                onClick={() => handleDeleteInventory(tempInvData.id)}
                                className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
                                title="刪除紀錄"
                            >
                                <Trash2 className="w-5 h-5" />
                            </button>
                        )
                    }
                    onClose={() => { setActiveModal(null); setTempInvData(null); }} 
                    className="max-w-sm"
                    footer={null} 
                    mobileFullScreen={true}
                >
                    <div className="flex flex-col h-full">
                        <form id="invForm" className="flex-1" key={tempInvData?.id || 'new'} onSubmit={(e) => e.preventDefault()}>
                            <InventoryForm 
                                initialData={tempInvData || { cardId: card.id }} 
                                onSave={handleSaveInventory} 
                                sourceOptions={uniqueSources}
                                uniqueSources={uniqueSources}
                                onRenameSource={onRenameSource}
                                onDeleteSource={onDeleteSource}
                                albums={albums}
                            />
                        </form>
                    </div>
                </Modal>
            )}

            {activeModal === 'list' && (
                <Modal title="加入收藏冊" onClose={() => setActiveModal(null)} className="max-w-sm">
                    <div className="space-y-2">
                        {(customLists || []).filter(l => !String(l.id).startsWith('sys_sort_') && (!l.groupId || String(l.groupId) === String(currentGroupId))).map(list => (
                            <button 
                                key={list.id}
                                onClick={() => handleAddToList(list.id, prompt("備註文字"))}
                                className="w-full text-left p-4 text-sm hover:bg-gray-50 rounded-xl border flex justify-between items-center group transition-colors"
                            >
                                <span className="font-bold text-gray-700">{list.title}</span>
                                <Plus className="w-5 h-5 text-gray-300 group-hover:text-indigo-600" />
                            </button>
                        ))}
                    </div>
                </Modal>
            )}
        </div>
    );
}

function LibraryTab({ currentGroupId, members, series, batches, channels, types, cards, setViewingCard, inventory, sales, openModal, combinedTypes, combinedChannels, uniqueSeriesTypes, isSelectionMode, setIsSelectionMode, selectedItems, setSelectedItems, selectedBatches, setSelectedBatches, batchCategorizeTarget, setBatchCategorizeTarget, allCards, setGroups, setSeries, setBatches, setCards, cols, setCols, subunits, setSubunits }) {
  const [filterMemberId, setFilterMemberId] = useState('All');
  const [filterSubunit, setFilterSubunit] = useState('All'); 
  const [filterSeriesId, setFilterSeriesId] = useState('All');
  const [filterSeriesType, setFilterSeriesType] = useState('All'); 
  const [filterBatchId, setFilterBatchId] = useState('All');
  const [filterType, setFilterType] = useState('All');
  const [filterChannel, setFilterChannel] = useState('All');
  
  const [editingOption, setEditingOption] = useState(null);

  const currentMembers = (members || []).filter(m => String(m.groupId) === String(currentGroupId));
  
  // 🌟 升級版 uniqueSubunits：結合資料庫中的 subunits 與成員中遺留的 subunit 字串
  const uniqueSubunits = useMemo(() => {
      const defined = (subunits || []).filter(s => String(s.groupId) === String(currentGroupId));
      const definedNames = new Set(defined.map(s => s.name));
      
      const used = [...new Set(currentMembers.map(m => m.subunit).filter(Boolean))];
      const missing = used.filter(name => !definedNames.has(name)).map(name => ({
          id: `temp_${name}`,
          name,
          groupId: String(currentGroupId),
          sortOrder: 999
      }));
      
      return [...defined, ...missing].sort((a, b) => {
          const valA = (a.sortOrder !== undefined && a.sortOrder !== null) ? Number(a.sortOrder) : 999;
          const valB = (b.sortOrder !== undefined && b.sortOrder !== null) ? Number(b.sortOrder) : 999;
          return valA - valB;
      });
  }, [subunits, currentMembers, currentGroupId]);

  useEffect(() => {
    setFilterMemberId('All');
    setFilterSeriesId('All');
    setFilterBatchId('All');
    setFilterType('All');
    setFilterChannel('All');
    setFilterSeriesType('All');
  }, [currentGroupId]);

  useEffect(() => {
      if (uniqueSubunits.length > 0) {
          const isValid = uniqueSubunits.some(s => s.name === filterSubunit);
          if (filterSubunit === 'All' || !isValid) {
              setFilterSubunit(uniqueSubunits[0].name);
          }
      } else {
          setFilterSubunit('All'); 
      }
  }, [uniqueSubunits, filterSubunit]);

  // 🌟 核心選取邏輯：支援完美切換 (點擊已選取則取消，點擊未選取則加入)
  const handleSelectAdd = (cardId) => {
      setSelectedItems(prev => {
          const isSelected = prev.some(item => String(item.cardId) === String(cardId));
          if (isSelected) {
              return prev.filter(item => String(item.cardId) !== String(cardId));
          } else {
              return [...prev, { uid: `sel_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`, cardId }];
          }
      });
  };

  const handleLongPress = (type, value, name) => {
      setIsSelectionMode(true);
      setBatchCategorizeTarget({ type, value, name });
      
      const itemsToSelect = (allCards || []).filter(c => {
          if (String(c.groupId) !== String(currentGroupId)) return false; // 🌟 致命修正：強制轉字串比對，解決卡片全數被錯誤過濾的問題
          if (type === 'type' || type === 'channel') {
              // 🌟 修正：相容舊版直接儲存「名稱」與新版儲存「ID」的差異
              const arr = type === 'type' ? types : channels;
              const obj = (arr || []).find(x => String(x.id) === String(value));
              return String(c[type]) === String(value) || (obj && String(c[type]) === String(obj.name));
          }
          return String(c[type]) === String(value);
      });
      
      // 🌟 恢復合併邏輯：保留使用者「先手動選好的卡片」，並補上「原屬於該分類的卡片」，完美解決「選取後被重置」與「踢出原卡片」的問題！
      setSelectedItems(prevItems => {
          const existingCardIds = new Set(prevItems.map(item => String(item.cardId)));
          const itemsToAdd = itemsToSelect.filter(item => !existingCardIds.has(String(item.id))).map(c => ({
              uid: `sel_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
              cardId: c.id
          }));
          return [...prevItems, ...itemsToAdd];
      });
      
      if (type === 'seriesId') {
          const batchesToSelect = (batches || []).filter(b => String(b.groupId) === String(currentGroupId) && String(b.seriesId) === String(value)); // 🌟 這裡也補上防禦
          setSelectedBatches(prevBatches => {
              const existingBatchIds = new Set(prevBatches.map(id => String(id)));
              const batchesToAdd = batchesToSelect.filter(b => !existingBatchIds.has(String(b.id))).map(b => b.id);
              return [...prevBatches, ...batchesToAdd];
          });
      }
  };

  const handleOptionDoubleClick = (type, data) => {
      if (type === 'series' || type === 'batch' || type === 'channel' || type === 'type') {
          openModal(type, data);
      } else {
          setEditingOption({ type, data });
      }
  };

  const handleOptionRename = async (newName) => {
      if (!editingOption) return;
      const { type, data } = editingOption;

      if (type === 'seriesType') {
          setSeries(prev => prev.map(s => s.type === data.value ? { ...s, type: newName } : s));
          await supabase.from('series').update({ type: newName }).eq('type', data.value);
      }
  };

  const handleOptionDelete = async () => {
      if (!editingOption) return;
      const { type, data } = editingOption;

      if (type === 'seriesType') {
          setSeries(prev => prev.map(s => s.type === data.value ? { ...s, type: '' } : s));
          await supabase.from('series').update({ type: '' }).eq('type', data.value);
      }
  };

  const displayMembers = currentMembers.filter(m => filterSubunit === 'All' || m.subunit === filterSubunit);

  const currentSeries = (series || []).filter(s => {
      if (String(s.groupId) !== String(currentGroupId)) return false;
      if (filterSubunit !== 'All' && s.subunit !== filterSubunit) return false;
      if (filterSeriesType !== 'All' && s.type !== filterSeriesType) return false;
      return true;
  }).sort((a, b) => new Date(a.date || '9999-12-31') - new Date(b.date || '9999-12-31'));
  
  const currentBatches = (batches || []).filter(b => {
      if (String(b.groupId) !== String(currentGroupId)) return false;
      if (filterSeriesId !== 'All' && String(b.seriesId) !== String(filterSeriesId)) return false;
      // 🌟 修正：不再因為選擇子類或通路而隱藏批次 (因為批次本身可能沒有設定類型，導致被錯誤過濾)
      // if (filterType !== 'All' && b.type !== filterType) return false;
      
      // 🌟 應要求恢復「通路」篩選批次，並加入相容舊版資料的判斷 (ID 或 名稱)
      if (filterChannel !== 'All') {
          const ch = (channels || []).find(c => String(c.id) === String(filterChannel));
          if (String(b.channel) !== String(filterChannel) && (!ch || String(b.channel) !== String(ch.name))) return false;
      }
      return true;
  }).sort((a, b) => {
      const typeA = (types || []).find(t => t.id === a.type || t.name === a.type);
      const typeB = (types || []).find(t => t.id === b.type || t.name === b.type);
      const sortOrderA = typeA ? (Number(typeA.sortOrder) || 0) : 999;
      const sortOrderB = typeB ? (Number(typeB.sortOrder) || 0) : 999;
      
      if (sortOrderA !== sortOrderB) {
          return sortOrderA - sortOrderB;
      }
      
      const dateA = a.date ? new Date(a.date).getTime() : 253402214400000;
      const dateB = b.date ? new Date(b.date).getTime() : 253402214400000;
      if (dateA !== dateB) return dateA - dateB;
      
      const nameA = a.name || '';
      const nameB = b.name || '';
      return nameA.localeCompare(nameB, 'zh-TW', { numeric: true });
  });
  
  const filteredCards = (cards || []).filter(card => {
    if (String(card.groupId) !== String(currentGroupId)) return false;
    
    if (filterSubunit !== 'All' && filterMemberId === 'All') {
        const mem = currentMembers.find(m => String(m.id) === String(card.memberId));
        if (!mem || mem.subunit !== filterSubunit) return false;
    }
    
    if (filterMemberId !== 'All' && String(card.memberId) !== String(filterMemberId)) return false;
    if (filterSeriesId !== 'All' && String(card.seriesId) !== String(filterSeriesId)) return false;
    if (filterSeriesType !== 'All' && filterSeriesId === 'All') {
        const cardSeries = (series || []).find(s => String(s.id) === String(card.seriesId));
        if (!cardSeries || cardSeries.type !== filterSeriesType) return false;
    }
    if (filterType !== 'All' && String(card.type) !== String(filterType)) return false;
    if (filterChannel !== 'All' && String(card.channel) !== String(filterChannel)) return false;
    if (filterBatchId !== 'All' && String(card.batchId) !== String(filterBatchId)) return false;
    
    return true;
  }).sort((cardA, cardB) => {
      const safeString = (val) => val ? String(val) : '';
      const safeNum = (val, defaultVal) => {
          const n = Number(val);
          return isNaN(n) ? defaultVal : n;
      };

      const hasBatchA = !!cardA.batchId;
      const hasBatchB = !!cardB.batchId;

      // 🌟 0. 無批次的小卡排在有批次的小卡後
      if (hasBatchA !== hasBatchB) return hasBatchA ? -1 : 1;

      // 1. 系列時間 (越舊越前)
      const sA = (series || []).find(s => String(s.id) === String(cardA.seriesId));
      const sB = (series || []).find(s => String(s.id) === String(cardB.seriesId));
      const dateA_series = sA?.date ? new Date(sA.date).getTime() : 253402214400000;
      const dateB_series = sB?.date ? new Date(sB.date).getTime() : 253402214400000;

      if (!hasBatchA && !hasBatchB) {
          // 🌟 無批次排序：系列時間 -> 小卡名稱 -> 成員順序
          if (dateA_series !== dateB_series) return dateA_series - dateB_series;
          const nameCompare = safeString(cardA.name).localeCompare(safeString(cardB.name), 'zh-TW', { numeric: true });
          if (nameCompare !== 0) return nameCompare;
          const mA = (members || []).find(m => String(m.id) === String(cardA.memberId));
          const mB = (members || []).find(m => String(m.id) === String(cardB.memberId));
          const mSortA = mA ? safeNum(mA.sortOrder, 999) : 999;
          const mSortB = mB ? safeNum(mB.sortOrder, 999) : 999;
          if (mSortA !== mSortB) return mSortA - mSortB;
          return safeString(cardA.id).localeCompare(safeString(cardB.id));
      }

      if (dateA_series !== dateB_series) return dateA_series - dateB_series;

      // 2. 子類排序 (數字越小排越前面)
      const tA = (types || []).find(t => String(t.id) === String(cardA.type) || t.name === cardA.type);
      const tB = (types || []).find(t => String(t.id) === String(cardB.type) || t.name === cardB.type);
      const sortA_type = tA ? safeNum(tA.sortOrder, 999) : 999;
      const sortB_type = tB ? safeNum(tB.sortOrder, 999) : 999;
      if (sortA_type !== sortB_type) return sortA_type - sortB_type;

      // 3. 批次時間 (越舊越前)
      const bA = (batches || []).find(b => String(b.id) === String(cardA.batchId));
      const bB = (batches || []).find(b => String(b.id) === String(cardB.batchId));
      const dateA_batch = bA?.date ? new Date(bA.date).getTime() : 253402214400000;
      const dateB_batch = bB?.date ? new Date(bB.date).getTime() : 253402214400000;
      if (dateA_batch !== dateB_batch) return dateA_batch - dateB_batch;

      // 4. 批次名稱
      const nameA = safeString(bA?.name);
      const nameB = safeString(bB?.name);
      const nameCompare = nameA.localeCompare(nameB, 'zh-TW', { numeric: true });
      if (nameCompare !== 0) return nameCompare;

      // 5. 成員排序 (數字越小排越前面)
      const mA = (members || []).find(m => String(m.id) === String(cardA.memberId));
      const mB = (members || []).find(m => String(m.id) === String(cardB.memberId));
      const mSortA = mA ? safeNum(mA.sortOrder, 999) : 999;
      const mSortB = mB ? safeNum(mB.sortOrder, 999) : 999;
      if (mSortA !== mSortB) return mSortA - mSortB;

      return safeString(cardA.id).localeCompare(safeString(cardB.id));
  });

  const inventoryMap = useMemo(() => {
      const map = {};
      (inventory || []).forEach(inv => {
          if (!inv.sellPrice || inv.sellPrice <= 0) {
              const key = String(inv.cardId);
              if (!map[key]) map[key] = { total: 0, arrived: 0, unshipped: 0, hoarded: 0 };
              const qty = Number(inv.quantity || 1);
              map[key].total += qty;
              if (inv.status === '未發貨') map[key].unshipped += qty;
              else if (inv.status === '囤貨') map[key].hoarded += qty;
              else map[key].arrived += qty; // 若無設定或到貨，皆歸類至到貨
          }
      });
      return map;
  }, [inventory]);

  const getCardQuantity = (cardId) => inventoryMap[String(cardId)]?.total || 0;
  
  const handleAddNewCard = () => {
    openModal('card', {
      memberId: filterMemberId !== 'All' ? filterMemberId : '',
      seriesId: filterSeriesId !== 'All' ? filterSeriesId : '',
      batchId: filterBatchId !== 'All' ? filterBatchId : '',
      type: filterType !== 'All' ? filterType : '',
      channel: filterChannel !== 'All' ? filterChannel : '',
      _filterSubunit: filterSubunit // 🌟 傳遞當前分隊篩選狀態
    });
  };

  return (
    <div className="space-y-6 pb-24">
      {editingOption && (
          <OptionManageModal 
             type={editingOption.type}
             data={editingOption.data}
             onClose={() => setEditingOption(null)}
             onRename={handleOptionRename}
             onDelete={handleOptionDelete}
          />
      )}

      <section>
        {uniqueSubunits.length > 0 && (
            <div className="flex gap-2 overflow-x-auto no-scrollbar px-1 mb-3">
                {uniqueSubunits.map(sub => (
                    <SubunitTagItem
                        key={sub.id || sub.name}
                        text={sub.name}
                        isSelected={filterSubunit === sub.name}
                        onClick={() => { 
                            if (filterSubunit !== sub.name) {
                                setFilterSubunit(sub.name); 
                                setFilterMemberId('All'); 
                                setFilterSeriesId('All'); 
                            }
                        }}
                        onLongPress={() => openModal('subunit', sub.id.startsWith('temp_') ? { name: sub.name, groupId: currentGroupId } : sub)}
                    />
                ))}
            </div>
        )}
        
        <div className="flex gap-4 overflow-x-auto pb-2 no-scrollbar px-1">
           {displayMembers.map(m => (
             <MemberItem 
                key={m.id} 
                member={m} 
                isSelected={filterMemberId === m.id}
                onClick={() => setFilterMemberId(filterMemberId === m.id ? 'All' : m.id)}
                onLongPress={(m) => handleLongPress('memberId', m.id, m.name)}
                onDoubleClick={() => openModal('member', m)}
             />
           ))}
           <button onClick={() => openModal('member', { subunit: filterSubunit !== 'All' ? filterSubunit : '' })} className="flex flex-col items-center gap-1 min-w-[64px] group">
              <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center border-2 border-dashed border-gray-300 group-hover:bg-indigo-50 group-hover:border-indigo-300 transition-colors">
                <Plus className="w-6 h-6 text-gray-400 group-hover:text-indigo-500" />
              </div>
              <span className="text-xs text-gray-400">新增成員</span>
           </button>
        </div>
      </section>

      <section>
        <div className="flex flex-col gap-2 mb-2 px-1">
          <div className="flex justify-between items-center">
             <div className="flex items-center gap-2 cursor-pointer" onClick={() => setFilterSeriesId('All')}>
                <h3 className="font-bold text-lg text-gray-800">系列</h3>
                <ChevronRight className="w-4 h-4 text-gray-400" />
             </div>
             <button onClick={() => openModal('series', { subunit: filterSubunit !== 'All' ? filterSubunit : '' })} className="text-xs bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded flex items-center gap-1">
                  <Plus className="w-3 h-3" /> 新增系列
             </button>
          </div>
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
              <button onClick={() => setFilterSeriesType('All')} className={`px-2 py-1 text-[10px] rounded-full whitespace-nowrap border ${filterSeriesType === 'All' ? 'bg-indigo-50 border-indigo-200 text-indigo-700 font-bold' : 'bg-white border-gray-200 text-gray-500'}`}>全部類型</button>
              {(uniqueSeriesTypes || []).map(t => (
                  <button 
                    key={t} 
                    onClick={() => setFilterSeriesType(filterSeriesType === t ? 'All' : t)} 
                    onDoubleClick={() => handleOptionDoubleClick('seriesType', { value: t })}
                    className={`px-2 py-1 text-[10px] rounded-full whitespace-nowrap border ${filterSeriesType === t ? 'bg-indigo-50 border-indigo-200 text-indigo-700 font-bold' : 'bg-white border-gray-200 text-gray-500'}`}
                  >
                    {t}
                  </button>
              ))}
          </div>
        </div>

        <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
            {currentSeries.map(s => (
                <SeriesItem 
                    key={s.id} 
                    series={s} 
                    isSelected={filterSeriesId === s.id}
                    onClick={() => {
                        setFilterSeriesId(filterSeriesId === s.id ? 'All' : s.id);
                        setFilterBatchId('All'); 
                    }}
                    onLongPress={(s) => handleLongPress('seriesId', s.id, s.name)}
                    onDoubleClick={() => handleOptionDoubleClick('series', s)}
                />
            ))}
        </div>
      </section>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex flex-col gap-3 mb-4 border-b pb-3">
            <div className="flex justify-between items-center">
                 <h3 className="font-bold text-gray-800 flex items-center gap-1">圖鑑 <span className="text-xs font-normal text-gray-500">{filteredCards.length}</span></h3>
                 <div className="flex gap-2 items-center">
                     {isSelectionMode && (
                         <button 
                             onClick={() => {
                                 const existingCardIds = new Set(selectedItems.map(item => String(item.cardId)));
                                 const allDisplayedSelected = filteredCards.length > 0 && filteredCards.every(c => existingCardIds.has(String(c.id)));
                                 if (allDisplayedSelected) {
                                     const idsToRemove = new Set(filteredCards.map(c => String(c.id)));
                                     setSelectedItems(prev => prev.filter(item => !idsToRemove.has(String(item.cardId))));
                                 } else {
                                     const itemsToAdd = filteredCards.filter(c => !existingCardIds.has(String(c.id))).map(c => ({
                                         uid: `sel_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
                                         cardId: c.id
                                     }));
                                     setSelectedItems(prev => [...prev, ...itemsToAdd]);
                                 }
                             }}
                             className="flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-bold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors"
                         >
                             <CheckSquare className="w-3 h-3" /> 全選顯示
                         </button>
                     )}
                     <div className="flex bg-gray-100 p-1 rounded-full items-center h-8 shadow-sm">
                       <Grid className="w-3.5 h-3.5 text-gray-400 ml-1.5" />
                       <select 
                          value={cols}
                          onChange={(e) => setCols(Number(e.target.value))}
                          className="bg-transparent text-xs font-bold text-gray-600 outline-none px-1 appearance-none border-none focus:ring-0 cursor-pointer"
                       >
                                    {[2,3,4,5,6,7,8,9,10].map(n => <option key={n} value={n}>{n}</option>)}
                       </select>
                    </div>
                     <button 
                        onClick={() => { 
                            if (isSelectionMode) {
                                setIsSelectionMode(false); setSelectedItems([]); setSelectedBatches([]); setBatchCategorizeTarget(null);
                            } else {
                                setIsSelectionMode(true);
                            }
                        }}
                        className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold shadow-sm transition-colors ${isSelectionMode ? 'bg-gray-800 text-white' : 'bg-white border hover:bg-gray-50'}`}
                     >
                        <CheckSquare className="w-3 h-3" /> {isSelectionMode ? '取消選取' : '批量選取'}
                     </button>
                     <button onClick={handleAddNewCard} className="flex items-center gap-1 bg-black text-white px-3 py-1.5 rounded-full text-xs font-bold shadow-sm hover:bg-gray-800">
                        <Plus className="w-3 h-3" /> 新增
                     </button>
                 </div>
            </div>
            
            <div className="space-y-3">
               <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                   <div className="flex items-center gap-1 cursor-pointer group pr-2 border-r border-gray-200 shrink-0" onClick={() => openModal('type', { groupId: currentGroupId })}>
                        <span className="text-xs font-bold text-gray-400 whitespace-nowrap">子類</span>
                        <Plus className="w-3 h-3 text-gray-300 group-hover:text-indigo-500" />
                   </div>
                   {(combinedTypes || []).map(t => (
                       <FilterTagItem 
                            key={t.id}
                            text={t.name}
                            isSelected={filterType === t.id}
                           onClick={() => {
                               setFilterType(filterType === t.id ? 'All' : t.id);
                               setFilterBatchId('All');
                           }}
                            onLongPress={(val) => handleLongPress('type', t.id, t.name)}
                            onDoubleClick={() => handleOptionDoubleClick('type', t)}
                       />
                   ))}
               </div>
               <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                   <div className="flex items-center gap-1 cursor-pointer group pr-2 border-r border-gray-200 shrink-0" onClick={() => openModal('channel', { groupId: currentGroupId })}>
                        <span className="text-xs font-bold text-gray-400 whitespace-nowrap">通路</span>
                        <Plus className="w-3 h-3 text-gray-300 group-hover:text-indigo-500" />
                   </div>
                   {(combinedChannels || []).map(c => (
                       <FilterTagItem 
                            key={c.id}
                            text={c.name}
                            isSelected={filterChannel === c.id}
                           onClick={() => {
                               setFilterChannel(filterChannel === c.id ? 'All' : c.id);
                               setFilterBatchId('All');
                           }}
                            onLongPress={(val) => handleLongPress('channel', c.id, c.name)}
                            onDoubleClick={() => handleOptionDoubleClick('channel', c)}
                       />
                   ))}
               </div>
               {filterSeriesId !== 'All' && (
                   <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
                       <div className="flex items-center gap-1 cursor-pointer group pr-2 border-r border-gray-200 shrink-0" onClick={() => openModal('batch', { seriesId: filterSeriesId, type: filterType !== 'All' ? filterType : '', channel: filterChannel !== 'All' ? filterChannel : '' })}>
                            <span className="text-xs font-bold text-gray-400 whitespace-nowrap">批次</span>
                            <Plus className="w-3 h-3 text-gray-300 group-hover:text-indigo-500" />
                       </div>
                       <div className="flex gap-3">
                            {currentBatches.length > 0 ? currentBatches.map(b => (
                                <BatchItem 
                                    key={b.id} 
                                    batch={b}
                                    isSelected={isSelectionMode ? (selectedBatches || []).includes(b.id) : filterBatchId === b.id}
                                    onClick={() => {
                                        if (isSelectionMode) {
                                            setSelectedBatches(prev => prev.includes(b.id) ? prev.filter(id => id !== b.id) : [...prev, b.id]);
                                        } else {
                                            setFilterBatchId(filterBatchId === b.id ? 'All' : b.id);
                                        }
                                    }}
                                    onLongPress={(b) => { if (!isSelectionMode) handleLongPress('batchId', b.id, b.name); }}
                                    onDoubleClick={() => handleOptionDoubleClick('batch', b)}
                                />
                            )) : (
                                <div className="text-xs text-gray-400 flex items-center px-1">無相關批次資料</div>
                            )}
                       </div>
                   </div>
               )}
            </div>
        </div>

        <div 
            className="grid gap-2 sm:gap-3 lg:gap-4 transition-all duration-300 ease-in-out mt-2"
            style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        >
            {filteredCards.map(card => {
                        const isSelected = selectedItems.some(i => String(i.cardId) === String(card.id));
                        const invStats = inventoryMap[String(card.id)] || { total: 0, arrived: 0, unshipped: 0, hoarded: 0 };
                        const { arrived, unshipped, hoarded, total } = invStats;
                        const isSelling = (sales || []).some(s => String(s.cardId) === String(card.id) && Number(s.quantity) > 0);

                        const memberName = (members || []).find(m => String(m.id) === String(card.memberId))?.name;
                        // 🌟 補回名稱顯示邏輯
                        const cardSeries = (series || []).find(s => String(s.id) === String(card.seriesId));
                        const seriesName = cardSeries?.shortName || cardSeries?.name;
                        const cardBatch = (batches || []).find(b => String(b.id) === String(card.batchId));
                        
                        const effectiveType = card.type;
                        const typeObj = (types || []).find(t => String(t.id) === String(effectiveType) || t.name === effectiveType);
                        const displayType = typeObj ? (typeObj.shortName || typeObj.name) : effectiveType;
                        
                        const effectiveChannelId = card.channel;
                        const channelObj = (channels || []).find(c => String(c.id) === String(effectiveChannelId) || c.name === effectiveChannelId);
                        const displayChannel = channelObj ? (channelObj.shortName || channelObj.name) : effectiveChannelId;
                        
                        const batchNumber = cardBatch?.batchNumber;
                        const channelAndBatch = [displayChannel, batchNumber].filter(Boolean).join('');
                        const displayTitle = [seriesName, channelAndBatch, displayType].filter(Boolean).join(' ');

                        return (
                            <div key={card.id} 
                                className={`cursor-pointer group relative select-none ${isSelected ? 'scale-95' : ''}`}
                                style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none' }}
                                onClick={(e) => {
                                    if (isSelectionMode) {
                                        handleSelectAdd(card.id);
                                    } else {
                                        setViewingCard(card);
                                    }
                                }}
                            >
                                {(() => {
                                    const isOriginalTarget = isSelectionMode && batchCategorizeTarget && (() => {
                                        const { type, value } = batchCategorizeTarget;
                                        if (type === 'type' || type === 'channel') {
                                            const arr = type === 'type' ? types : channels;
                                            const obj = (arr || []).find(x => String(x.id) === String(value));
                                            return String(card[type]) === String(value) || (obj && String(card[type]) === String(obj.name));
                                        }
                                        return String(card[type]) === String(value);
                                    })();
                                    return (
                                        <div className={`aspect-[2/3] rounded-lg bg-gray-200 overflow-hidden relative mb-1.5 sm:mb-2 shadow-sm border transition-all ${isSelected ? 'border-indigo-600 ring-2 ring-indigo-600 shadow-md' : isOriginalTarget ? 'border-pink-400 ring-2 ring-pink-400 opacity-90' : 'border-gray-100'}`}>
                                            {card.image ? (
                                                <Image src={card.image} alt="卡片" fill loading="lazy" sizes="(max-width: 768px) 33vw, 20vw" className="object-cover pointer-events-none" unoptimized={true} />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-gray-300">
                                                    <ImageIcon className="w-8 h-8" />
                                                </div>
                                            )}
                                            <div className="absolute top-1 sm:top-2 left-1 sm:left-2 z-10 flex flex-col gap-1">
                                                {!!card.isWishlist && <div className="bg-pink-500 text-white p-1 rounded-full shadow"><Heart className="w-2.5 h-2.5 sm:w-3 sm:h-3 fill-current" /></div>}
                                                {isSelling && <div className="bg-blue-500 text-white p-1 rounded-full shadow"><Coins className="w-2.5 h-2.5 sm:w-3 sm:h-3 fill-current" /></div>}
                                            </div>
                                            {isSelectionMode && (
                                                <div className={`absolute top-2 right-2 w-5 h-5 rounded-full border-2 flex items-center justify-center z-20 ${isSelected ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white/50 border-gray-400'}`}>
                                                    {isSelected && <Check className="w-3 h-3" />}
                                                </div>
                                            )}
                                            {total > 0 && (
                                                <div className={`absolute top-1 sm:top-2 ${isSelectionMode ? 'right-8' : 'right-1 sm:right-2'} flex flex-col gap-0.5 z-10 items-end transition-all`}>
                                                    {arrived > 0 && <div className="bg-green-500 text-white text-[9px] sm:text-[10px] font-bold px-1 sm:px-1.5 py-0.5 rounded shadow" title="到貨">{arrived}</div>}
                                                    {hoarded > 0 && <div className="bg-blue-500 text-white text-[9px] sm:text-[10px] font-bold px-1 sm:px-1.5 py-0.5 rounded shadow" title="囤貨">{hoarded}</div>}
                                                    {unshipped > 0 && <div className="bg-red-500 text-white text-[9px] sm:text-[10px] font-bold px-1 sm:px-1.5 py-0.5 rounded shadow" title="未發貨">{unshipped}</div>}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })()}
                                
                                {/* 🌟 顯示名稱 (與收藏頁籤一致) */}
                                <div className="px-0.5 sm:px-1">
                                    <div className="text-[9px] sm:text-[10px] text-gray-400 uppercase font-bold mb-0.5">{memberName}</div>
                                    <div className="text-xs sm:text-sm font-bold text-gray-800 leading-tight mb-0.5 line-clamp-2">{displayTitle || '未命名卡片'}</div>
                                    {cardBatch?.name && <div className="text-[8px] sm:text-[9px] text-gray-400 mt-0.5 line-clamp-1">{cardBatch.name}</div>}
                                </div>
                            </div>
                        )
                    })}
        </div>
      </div>
    </div>
  );
}

function CollectionTab({ currentGroupId, cards, inventory, setViewingCard, members, series, batches, channels, types, sales, cols, setCols, subunits, customLists }) {
  const [viewMode, setViewMode] = useState('all');
  const [detailLevel, setDetailLevel] = useState(2); // 2: all, 1: partial, 0: none
  const [hideSelling, setHideSelling] = useState(false);
  const [sortDirection, setSortDirection] = useState('asc'); // asc: 舊到新, desc: 新到舊

  const [isMarkMode, setIsMarkMode] = useState(false);
  const [cardMarks, setCardMarks] = useState(() => {
      if (typeof window !== 'undefined') {
          try {
              const saved = localStorage.getItem('collection_card_marks');
              if (saved) return JSON.parse(saved);
          } catch (e) {}
      }
      return {};
  });
  const pressTimer = useRef(null);
  const hasCardLongPressed = useRef(false);

  useEffect(() => {
      if (typeof window !== 'undefined') {
          localStorage.setItem('collection_card_marks', JSON.stringify(cardMarks));
      }
  }, [cardMarks]);

  const startPress = (cardId) => {
      if (!isMarkMode) return;
      hasCardLongPressed.current = false;
      pressTimer.current = setTimeout(() => {
          hasCardLongPressed.current = true;
          setCardMarks(prev => {
              const current = prev[cardId] || 0;
              if (current <= 1) {
                  const next = { ...prev };
                  delete next[cardId];
                  return next;
              }
              return { ...prev, [cardId]: current - 1 };
          });
      }, 500);
  };
  const cancelPress = () => clearTimeout(pressTimer.current);

  useEffect(() => {
      return () => clearTimeout(pressTimer.current);
  }, []);

  const [filterSubunits, setFilterSubunits] = useState([]);
  const [filterMembers, setFilterMembers] = useState([]);
  const [filterTypes, setFilterTypes] = useState([]);
  const [filterChannels, setFilterChannels] = useState([]);

  const [showSeriesModal, setShowSeriesModal] = useState(false);
  const [filterSeriesType, setFilterSeriesType] = useState('All');
  const [filterSeries, setFilterSeries] = useState([]);
  const [filterBatches, setFilterBatches] = useState([]);

  // 🌟 基底資料還原：直接使用完整的 cards，這樣才能顯示灰色未擁有的卡片！
  const baseCards = cards || [];

  // 🚀 效能升級：七大極速字典，全部強制轉字串，徹底消滅型別卡頓！
  const inventoryMap = useMemo(() => {
      const map = {};
      (inventory || []).forEach(inv => {
          if (!inv.sellPrice || inv.sellPrice <= 0) {
              const key = String(inv.cardId);
              if (!map[key]) map[key] = { total: 0, arrived: 0, unshipped: 0, hoarded: 0 };
              const qty = Number(inv.quantity || 1);
              map[key].total += qty;
              if (inv.status === '未發貨') map[key].unshipped += qty;
              else if (inv.status === '囤貨') map[key].hoarded += qty;
              else map[key].arrived += qty;
          }
      });
      return map;
  }, [inventory]);

  const salesMap = useMemo(() => {
      const map = {};
      (sales || []).forEach(s => { if (Number(s.quantity) > 0) map[String(s.cardId)] = true; });
      return map;
  }, [sales]);

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

  const cardToListsMap = useMemo(() => {
      const map = {};
      (customLists || []).filter(l => !String(l.id).startsWith('sys_sort_') && (!l.groupId || String(l.groupId) === String(currentGroupId))).forEach(list => {
          (list.items || []).forEach(item => {
              const cardId = String(item.cardId);
              if (!map[cardId]) {
                  map[cardId] = [];
              }
              map[cardId].push(list.title);
          });
      });
      return map;
  }, [customLists]);

  // 🌟 修正分隊清單：從所有卡片的 Member 與 Series 推導出存在的分隊
  const availableSubunits = useMemo(() => {
      const usedNames = new Set();
      baseCards.forEach(c => {
          const m = memberMap[String(c.memberId)];
          const s = seriesMap[String(c.seriesId)];
          if (m && m.subunit) usedNames.add(m.subunit);
          if (s && s.subunit) usedNames.add(s.subunit); // 同時抓取 Series 層級的分隊設定
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
          // 🌟 雙重判斷：如果 member 沒有資料(例如批次卡)，則看 series 是否屬於該分隊
          return (m && filterSubunits.includes(m.subunit)) || (s && filterSubunits.includes(s.subunit));
      });
  }, [baseCards, filterSubunits, memberMap, seriesMap]);

  const availableMembers = useMemo(() => {
      const ids = new Set(subunitFilteredCards.map(c => String(c.memberId)));
      return (members || []).filter(m => ids.has(String(m.id)));
  }, [subunitFilteredCards, members]);

  const availableTypes = useMemo(() => {
      const ids = new Set(subunitFilteredCards.map(c => String(c.type)).filter(Boolean));
      const currentTypes = (types || []).filter(t => ids.has(String(t.id)) || ids.has(String(t.name)));
      ids.forEach(id => {
          if (!currentTypes.some(t => String(t.id) === id || String(t.name) === id)) {
              currentTypes.push({ id, name: id, shortName: '', sortOrder: 999 });
          }
      });
      return currentTypes.sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0));
  }, [subunitFilteredCards, types]);

  const availableChannels = useMemo(() => {
      const ids = new Set(subunitFilteredCards.map(c => String(c.channel)).filter(Boolean));
      const currentChannels = (channels || []).filter(c => ids.has(String(c.id)) || ids.has(String(c.name)));
      ids.forEach(id => {
          if (!currentChannels.some(c => String(c.id) === id || String(c.name) === id)) currentChannels.push({ id, name: id, shortName: '' });
      });
      const freqMap = {};
      subunitFilteredCards.forEach(c => { if (c.channel) freqMap[String(c.channel)] = (freqMap[String(c.channel)] || 0) + 1; });
      return currentChannels.sort((a, b) => (freqMap[String(b.id)] || freqMap[String(b.name)] || 0) - (freqMap[String(a.id)] || freqMap[String(a.name)] || 0));
  }, [subunitFilteredCards, channels]);
  
  const availableSeriesTypes = useMemo(() => {
      const ids = new Set(baseCards.map(c => String(c.seriesId)));
      return [...new Set((series || []).filter(s => ids.has(String(s.id))).map(s => s.type).filter(Boolean))];
  }, [baseCards, series]);
  
  const availableSeriesList = useMemo(() => {
      let filtered = (series || []).filter(s => baseCards.some(c => String(c.seriesId) === String(s.id)));
      if (filterSubunits.length > 0) {
          filtered = filtered.filter(s => filterSubunits.includes(s.subunit));
      }
      if (filterSeriesType !== 'All') {
          filtered = filtered.filter(s => s.type === filterSeriesType);
      }
      return filtered.sort((a, b) => new Date(b.date || '1970-01-01') - new Date(a.date || '1970-01-01'));
  }, [baseCards, series, filterSeriesType, filterSubunits]);

  const availableBatchesList = useMemo(() => {
      let filtered = (batches || []).filter(b => baseCards.some(c => String(c.batchId) === String(b.id)));
      if (filterSubunits.length > 0) {
          const validSeriesIds = new Set((series || []).filter(s => filterSubunits.includes(s.subunit)).map(s => String(s.id)));
          filtered = filtered.filter(b => validSeriesIds.has(String(b.seriesId)));
      }
      if (filterSeries.length > 0) {
          filtered = filtered.filter(b => filterSeries.includes(String(b.seriesId)));
      }
      return filtered.sort((a, b) => new Date(b.date || '1970-01-01') - new Date(a.date || '1970-01-01'));
  }, [baseCards, batches, filterSeries, filterSubunits, series]);

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

  const cardsInScope = useMemo(() => {
    return baseCards.filter(card => {
         // 🌟 修正批次卡篩選：檢查卡片的 memberId 或是 seriesId 所屬分隊
         if (filterSubunits.length > 0 && filterMembers.length === 0) {
             const mem = memberMap[String(card.memberId)];
             const ser = seriesMap[String(card.seriesId)];
             const belongsToSubunit = (mem && filterSubunits.includes(mem.subunit)) || (ser && filterSubunits.includes(ser.subunit));
             if (!belongsToSubunit) return false;
         }

         if (filterMembers.length > 0 && !filterMembers.includes(String(card.memberId))) return false;
         if (filterSeries.length > 0 && !filterSeries.includes(String(card.seriesId))) return false;
         
         if (filterSeriesType !== 'All' && filterSeries.length === 0) {
            const s = seriesMap[String(card.seriesId)];
            if (!s || s.type !== filterSeriesType) return false;
         }

         if (filterTypes.length > 0 && !filterTypes.includes(String(card.type))) return false;
         if (filterChannels.length > 0 && !filterChannels.includes(String(card.channel))) return false;
         if (filterBatches.length > 0 && !filterBatches.includes(String(card.batchId))) return false;
         
         return true;
    });
  }, [baseCards, filterMembers, filterTypes, filterChannels, filterSeriesType, filterSeries, filterBatches, memberMap, seriesMap, filterSubunits]);

  const filteredCards = cardsInScope.filter(card => {
     if (viewMode === 'wishlist' && !card.isWishlist) return false;
     if (viewMode === 'selling' && !salesMap[card.id] && !salesMap[String(card.id)]) return false;
     if (viewMode === 'owned') {
         if (!(inventoryMap[card.id]?.total > 0) && !(inventoryMap[String(card.id)]?.total > 0)) return false;
         if (hideSelling && (salesMap[card.id] || salesMap[String(card.id)])) return false;
     }
     return true;
  }).sort((cardA, cardB) => {
      const safeString = (val) => val ? String(val) : '';
      const safeNum = (val, defaultVal) => { const n = Number(val); return isNaN(n) ? defaultVal : n; };

      const hasBatchA = !!cardA.batchId;
      const hasBatchB = !!cardB.batchId;

      // 🌟 0. 無批次的小卡排在有批次的小卡後
      if (hasBatchA !== hasBatchB) return hasBatchA ? -1 : 1;

      // 1. 系列時間 (越舊越前)
      const sA = seriesMap[String(cardA.seriesId)];
      const sB = seriesMap[String(cardB.seriesId)];
      const dateA_series = sA?.date ? new Date(sA.date).getTime() : 253402214400000;
      const dateB_series = sB?.date ? new Date(sB.date).getTime() : 253402214400000;

      if (!hasBatchA && !hasBatchB) {
          // 🌟 無批次排序：系列時間 -> 小卡名稱 -> 成員順序
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

      // 2. 子類排序 (數字越小排越前面)
      const tA = typeMap[String(cardA.type)];
      const tB = typeMap[String(cardB.type)];
      const sortA_type = tA ? safeNum(tA.sortOrder, 999) : 999;
      const sortB_type = tB ? safeNum(tB.sortOrder, 999) : 999;
      if (sortA_type !== sortB_type) return sortA_type - sortB_type;

      // 3. 批次時間 (越舊越前)
      const bA = batchMap[String(cardA.batchId)];
      const bB = batchMap[String(cardB.batchId)];
      const dateA_batch = bA?.date ? new Date(bA.date).getTime() : 253402214400000;
      const dateB_batch = bB?.date ? new Date(bB.date).getTime() : 253402214400000;
      if (dateA_batch !== dateB_batch) return dateA_batch - dateB_batch;

      // 4. 批次名稱
      const nameA = safeString(bA?.name);
      const nameB = safeString(bB?.name);
      const nameCompare = nameA.localeCompare(nameB, 'zh-TW', { numeric: true });
      if (nameCompare !== 0) return nameCompare;

      // 5. 成員排序 (數字越小排越前面)
      const mA = memberMap[String(cardA.memberId)];
      const mB = memberMap[String(cardB.memberId)];
      const mSortA = mA ? safeNum(mA.sortOrder, 999) : 999;
      const mSortB = mB ? safeNum(mB.sortOrder, 999) : 999;
      if (mSortA !== mSortB) return mSortA - mSortB;

      return safeString(cardA.id).localeCompare(safeString(cardB.id));
  });
  
  if (sortDirection === 'desc') {
      filteredCards.reverse();
  }
  
  // 🌟 修復進度條計算：以當前篩選範圍 (cardsInScope) 為基準，避免切換「擁有」時永遠顯示 100%
  const totalCount = cardsInScope.length;
  const ownedCount = cardsInScope.filter(c => (inventoryMap[c.id]?.total || inventoryMap[String(c.id)]?.total || 0) > 0).length; // 🌟 雙重比對
  const percentage = totalCount > 0 ? Math.round((ownedCount / totalCount) * 100) : 0;

  const RenderFilterSection = ({ label, options, current, onChange, mapName }) => (
     <div className="flex items-center gap-3 overflow-hidden">
        <span className="text-[10px] font-bold text-gray-400 whitespace-nowrap min-w-fit">{label}</span>
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 flex-1">
            {(options || []).map(opt => {
                const id = typeof opt === 'object' ? opt.id : opt;
                const name = mapName ? mapName(opt) : (typeof opt === 'object' ? opt.name : opt);
                const isSelected = current.includes(String(id));
                return (
                    <FilterTagItem 
                        key={id}
                        text={name}
                        isSelected={isSelected}
                        onClick={() => onChange(String(id))}
                        onLongPress={() => {}} 
                        onDoubleClick={() => {}}
                    />
                )
            })}
        </div>
     </div>
  );

  const toggleFilter = (setFunc, val) => {
      setFunc(prev => prev.includes(val) ? prev.filter(x => x !== val) : [...prev, val]);
  };

  return (
    <div className="space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center px-1 sm:px-2 gap-3 sm:gap-0">
            <h2 className="font-bold text-lg sm:text-xl flex items-center gap-2">
                我的收藏櫃 
                <span className="text-xs sm:text-sm font-normal text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                    {percentage}% ({ownedCount}/{totalCount})
                </span>
            </h2>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                 <div className="flex items-center gap-2">
                     {viewMode === 'owned' && (
                         <button
                             onClick={() => setHideSelling(!hideSelling)}
                             className={`p-2 rounded-lg transition-all h-8 flex items-center justify-center flex-shrink-0 ${hideSelling ? 'bg-indigo-100 text-indigo-700 shadow-sm' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                             title={hideSelling ? "點擊顯示販售中的卡片" : "點擊隱藏販售中的卡片"}
                         >
                             <div className="relative flex items-center justify-center">
                                 <Coins className={`w-4 h-4 ${hideSelling ? 'opacity-50' : ''}`} />
                                 {hideSelling && <div className="absolute top-1/2 left-1/2 w-[120%] h-[1.5px] bg-indigo-700 -translate-x-1/2 -translate-y-1/2 -rotate-45 rounded-full" />}
                             </div>
                         </button>
                     )}
                     <button
                         onClick={() => { setIsMarkMode(!isMarkMode); }}
                         className={`p-2 rounded-lg transition-all h-8 flex items-center justify-center flex-shrink-0 ${isMarkMode ? 'bg-indigo-600 text-white shadow-md' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}
                         title="標記模式 (點擊+1，長按或右鍵-1)"
                     >
                         <PenTool className="w-4 h-4" />
                     </button>
                     {isMarkMode && (
                         <button
                             onClick={() => {
                                 if (confirm('確定要清除所有標記嗎？')) setCardMarks({});
                             }}
                             className="p-2 rounded-lg transition-all h-8 flex items-center justify-center flex-shrink-0 bg-red-50 text-red-500 hover:bg-red-100 shadow-sm"
                             title="清除所有標記"
                         >
                             <Trash2 className="w-4 h-4" />
                         </button>
                     )}
                     <div className="flex bg-gray-100 p-1 rounded-lg items-center h-8 flex-shrink-0 flex-1 sm:flex-none">
                       <Grid className="w-3.5 h-3.5 text-gray-400 ml-1.5" />
                       <select 
                          value={cols}
                          onChange={(e) => setCols(Number(e.target.value))}
                          className="bg-transparent text-xs font-bold text-gray-600 outline-none px-1 appearance-none border-none focus:ring-0 cursor-pointer w-full"
                       >
                          {[2,3,4,5,6,7,8,9,10].map(n => <option key={n} value={n}>{n}</option>)}
                       </select>
                    </div>

                   <button 
                       onClick={() => setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')} 
                       className="px-3 py-1 rounded-lg transition-all h-8 flex items-center justify-center bg-gray-100 text-gray-600 hover:bg-gray-200 text-xs font-bold whitespace-nowrap"
                   >
                       {sortDirection === 'asc' ? '舊到新' : '新到舊'}
                   </button>

                    <button
                        onClick={() => setDetailLevel(prev => (prev + 2) % 3)}
                        className={`p-2 rounded-lg transition-all h-8 flex items-center justify-center flex-shrink-0 ${detailLevel > 0 ? 'bg-gray-200 text-gray-800' : 'bg-gray-100 text-gray-400'}`}
                        title={detailLevel === 2 ? "顯示部分資訊" : detailLevel === 1 ? "隱藏所有資訊" : "顯示完整資訊"}
                    >
                        {detailLevel === 2 && <Eye className="w-4 h-4" />}
                        {detailLevel === 1 && <Eye className="w-4 h-4 opacity-50" />}
                        {detailLevel === 0 && <EyeOff className="w-4 h-4" />}
                    </button>
                </div>
                <div className="flex bg-gray-100 p-1 rounded-lg h-8 items-center w-full sm:w-auto justify-between sm:justify-start">
                    <button onClick={() => setViewMode('all')} className={`px-3 h-full flex items-center justify-center flex-1 sm:flex-none text-xs font-bold rounded-md transition-all ${viewMode === 'all' ? 'bg-white text-black shadow-sm' : 'text-gray-400'}`}>全部</button>
                    <button onClick={() => setViewMode('wishlist')} className={`px-3 h-full flex items-center justify-center flex-1 sm:flex-none text-xs font-bold rounded-md transition-all ${viewMode === 'wishlist' ? 'bg-white text-pink-500 shadow-sm' : 'text-gray-400'}`}>想要</button>
                    <button onClick={() => setViewMode('selling')} className={`px-3 h-full flex items-center justify-center flex-1 sm:flex-none text-xs font-bold rounded-md transition-all ${viewMode === 'selling' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400'}`}>販售</button>
                    <button onClick={() => setViewMode('owned')} className={`px-3 h-full flex items-center justify-center flex-1 sm:flex-none text-xs font-bold rounded-md transition-all ${viewMode === 'owned' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-400'}`}>擁有</button>
                </div>
            </div>
        </div>
        
        <div className="bg-white p-3 sm:p-4 rounded-xl border border-gray-100 shadow-sm space-y-3 sm:space-y-4">
            {availableSubunits.length > 0 && (
                <RenderFilterSection label="分隊" options={availableSubunits} current={filterSubunits} onChange={(val) => { toggleFilter(setFilterSubunits, val); setFilterMembers([]); }} mapName={s => s.name} />
            )}
            {availableMembers.length > 0 && (
                <RenderFilterSection label="成員" options={availableMembers} current={filterMembers} onChange={(val) => toggleFilter(setFilterMembers, val)} mapName={m => m.name} />
            )}
            {availableTypes.length > 0 && (
                <RenderFilterSection label="子類" options={availableTypes} current={filterTypes} onChange={(val) => toggleFilter(setFilterTypes, val)} mapName={t => t.name} />
            )}
            {availableChannels.length > 0 && (
                <RenderFilterSection label="通路" options={availableChannels} current={filterChannels} onChange={(val) => toggleFilter(setFilterChannels, val)} mapName={c => c.name} />
            )}
            <div onClick={() => setShowSeriesModal(true)} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200 cursor-pointer hover:border-indigo-300 transition-all group">
                <div className="flex items-center gap-2 overflow-hidden">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">系列與版本</span>
                    <div className="h-4 w-px bg-gray-300 mx-1"></div>
                    <span className={`text-xs truncate font-medium ${getSeriesSummary() !== '全部系列' ? 'text-indigo-600' : 'text-gray-600'}`}>{getSeriesSummary()}</span>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-indigo-500" />
            </div>
        </div>

        <SeriesFilterModal 
            visible={showSeriesModal} onClose={() => setShowSeriesModal(false)}
            seriesTypes={availableSeriesTypes} 
            selectedSeriesType={filterSeriesType} 
            setSeriesType={(val) => {
                setFilterSeriesType(val);
                if (val === 'All') {
                    setFilterSeries([]);
                    setFilterBatches([]);
                }
            }}
            series={availableSeriesList} 
            selectedSeries={filterSeries} 
            setSeries={(val) => {
                setFilterSeries(val);
            }}
            batches={availableBatchesList} selectedBatches={filterBatches} setBatches={setFilterBatches}
        />

        <div className="grid gap-2 sm:gap-3 lg:gap-4 transition-all duration-300 ease-in-out mt-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
            {filteredCards.map(card => {
                const invStats = inventoryMap[String(card.id)] || { total: 0, arrived: 0, unshipped: 0, hoarded: 0 };
                const { arrived, unshipped, hoarded, total } = invStats;
                const isOwned = total > 0;
                const isSelling = (sales || []).some(s => String(s.cardId) === String(card.id) && Number(s.quantity) > 0);
                
                const memberName = memberMap[String(card.memberId)]?.name;
                const cardSeries = seriesMap[String(card.seriesId)];
                const seriesName = cardSeries?.shortName || cardSeries?.name;
                const cardBatch = batchMap[String(card.batchId)];
                
                const effectiveType = card.type;
                const typeObj = typeMap[String(effectiveType)];
                const displayType = typeObj ? (typeObj.shortName || typeObj.name) : effectiveType;
                
                const effectiveChannelId = card.channel;
                const channelObj = channelMap[String(effectiveChannelId)];
                const displayChannel = channelObj ? (channelObj.shortName || channelObj.name) : effectiveChannelId;
                
                const batchNumber = cardBatch?.batchNumber;
                const channelAndBatch = [displayChannel, batchNumber].filter(Boolean).join('');
                const displayTitle = [seriesName, channelAndBatch, displayType].filter(Boolean).join(' ');

                return (
                    <div 
                        key={card.id} 
                        className={`cursor-pointer group relative select-none ${isOwned ? '' : 'opacity-30 grayscale'} ${isMarkMode ? 'ring-2 ring-transparent hover:ring-indigo-300 rounded-lg' : ''}`}
                        style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none' }}
                        onMouseDown={() => startPress(card.id)}
                        onMouseUp={cancelPress}
                        onMouseLeave={cancelPress}
                        onTouchStart={() => startPress(card.id)}
                        onTouchEnd={cancelPress}
                        onTouchMove={cancelPress}
                        onContextMenu={(e) => {
                            if (isMarkMode) {
                                e.preventDefault();
                                cancelPress();
                                setCardMarks(prev => {
                                    const current = prev[card.id] || 0;
                                    if (current <= 1) {
                                        const next = { ...prev };
                                        delete next[card.id];
                                        return next;
                                    }
                                    return { ...prev, [card.id]: current - 1 };
                                });
                            }
                        }}
                        onClick={(e) => {
                            if (isMarkMode) {
                                if (hasCardLongPressed.current) {
                                    e.preventDefault();
                                    e.stopPropagation();
                                } else {
                                    setCardMarks(prev => ({ ...prev, [card.id]: (prev[card.id] || 0) + 1 }));
                                }
                            } else {
                                setViewingCard(card);
                            }
                        }}
                    >
                        <div className="aspect-[2/3] rounded-lg bg-gray-200 overflow-hidden relative mb-1.5 sm:mb-2 shadow-sm border border-gray-100">
                            {/* 🌟 收藏櫃：壓縮畫質至 30%，極速載入 */}
                            {card.image ? (
                                <Image src={card.image} alt="卡片" fill loading="lazy" quality={30} sizes="(max-width: 768px) 33vw, 20vw" className="object-cover pointer-events-none" unoptimized={true}/>
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-gray-300">
                                    <ImageIcon className="w-8 h-8" />
                                </div>
                            )}
                            
                            <div className="absolute top-1 sm:top-2 left-1 sm:left-2 z-10 flex flex-col gap-1">
                                {cardMarks[card.id] > 0 && (
                                    <div className="bg-indigo-600 text-white w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center rounded-full shadow-md text-xs font-bold z-20">
                                        {cardMarks[card.id]}
                                    </div>
                                )}
                                {!!card.isWishlist && <div className="bg-pink-500 text-white p-1 rounded-full shadow"><Heart className="w-2.5 h-2.5 sm:w-3 sm:h-3 fill-current" /></div>}
                                {isSelling && <div className="bg-blue-500 text-white p-1 rounded-full shadow"><Coins className="w-2.5 h-2.5 sm:w-3 sm:h-3 fill-current" /></div>}
                            </div>

                        {total > 0 && (
                            <div className="absolute top-1 sm:top-2 right-1 sm:right-2 flex flex-col gap-0.5 z-10 items-end">
                                {arrived > 0 && <div className="bg-green-500 text-white text-[9px] sm:text-[10px] font-bold px-1 sm:px-1.5 py-0.5 rounded shadow" title="到貨">{arrived}</div>}
                                {hoarded > 0 && <div className="bg-blue-500 text-white text-[9px] sm:text-[10px] font-bold px-1 sm:px-1.5 py-0.5 rounded shadow" title="囤貨">{hoarded}</div>}
                                {unshipped > 0 && <div className="bg-red-500 text-white text-[9px] sm:text-[10px] font-bold px-1 sm:px-1.5 py-0.5 rounded shadow" title="未發貨">{unshipped}</div>}
                            </div>
                        )}
                        </div>
                    {detailLevel > 0 && (
                            <div className="px-0.5 sm:px-1">
                            <div className="text-[9px] sm:text-[10px] text-gray-400 uppercase font-bold mb-0.5 flex items-center gap-1 flex-wrap">
                                <span>{memberName}</span>
                                {detailLevel === 2 && cardToListsMap[String(card.id)] && (
                                    <span className="text-indigo-500 bg-indigo-50 px-1 rounded truncate font-medium normal-case">
                                        {cardToListsMap[String(card.id)].join(', ')}
                                    </span>
                                )}
                            </div>
                                <div className="text-xs sm:text-sm font-bold text-gray-800 leading-tight mb-0.5 line-clamp-2">{displayTitle || '未命名卡片'}</div>
                                {cardBatch?.name && <div className="text-[8px] sm:text-[9px] text-gray-400 mt-0.5 line-clamp-1">{cardBatch.name}</div>}
                            </div>
                        )}
                    </div>
                )
            })}
        </div>
        {filteredCards.length === 0 && (
            <div className="text-center py-20 text-gray-400 bg-white rounded-xl border border-dashed">
                <BookOpen className="w-12 h-12 mx-auto mb-2 opacity-30" />
                <p>沒有符合條件的卡片</p>
            </div>
        )}
    </div>
  );
}


function InventoryTab({ cards, inventory, setViewingCard, series, bulkRecords, batches, channels, types, onEditBulkRecord, onDeleteInventory, onDeleteBulkRecord }) {
    const [dateFilterMode, setDateFilterMode] = useState('month');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [year, setYear] = useState(new Date().getFullYear());
    const [month, setMonth] = useState(new Date().getMonth() + 1);
    const [filterType, setFilterType] = useState('all'); 
    
    const [itemToDelete, setItemToDelete] = useState(null);
    
    // 🌟 同樣全面套用 String() 防禦機制
    const cardMap = useMemo(() => {
        const map = {};
        (cards || []).forEach(c => map[String(c.id)] = c);
        return map;
    }, [cards]);

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

    const pressTimer = useRef(null);
    const hasLongPressed = useRef(false);

    const startPress = (item) => {
        hasLongPressed.current = false;
        pressTimer.current = setTimeout(() => {
            hasLongPressed.current = true;
            setItemToDelete(item); // 🌟 長按觸發刪除確認
        }, 600); 
    };
    const cancelPress = () => clearTimeout(pressTimer.current);

    const handlePrev = () => {
        if (dateFilterMode === 'month') {
            if (month === 1) { setMonth(12); setYear(y => y - 1); } else setMonth(m => m - 1);
        } else if (dateFilterMode === 'year') { setYear(y => y - 1); }
    };

    const handleNext = () => {
        if (dateFilterMode === 'month') {
            if (month === 12) { setMonth(1); setYear(y => y + 1); } else setMonth(m => m + 1);
        } else if (dateFilterMode === 'year') { setYear(y => y + 1); }
    };

    const availableYears = useMemo(() => {
        const years = new Set([new Date().getFullYear(), year]);
        (inventory || []).forEach(inv => { if (inv.buyDate) years.add(new Date(inv.buyDate).getFullYear()); });
        return Array.from(years).sort((a, b) => b - a);
    }, [inventory, year]);

    const { displayItems, totalIncome, totalExpense } = useMemo(() => {
        const items = [];
        let income = 0; let expense = 0;
        
        const isDateInRange = (dateStr) => {
            if (!dateStr) return false;
            if (dateFilterMode === 'month') return dateStr.startsWith(`${year}-${String(month).padStart(2, '0')}`);
            if (dateFilterMode === 'year') return dateStr.startsWith(`${year}`);
            if (dateFilterMode === 'range') {
                if (!startDate && !endDate) return true;
                const targetDate = new Date(dateStr).getTime();
                const start = startDate ? new Date(startDate).getTime() : 0;
                const end = endDate ? new Date(endDate).getTime() + 86400000 - 1 : Infinity;
                return targetDate >= start && targetDate <= end;
            }
            return true;
        };

        (inventory || []).forEach(inv => {
            // 🌟 修正：若小卡屬於盤收/套收包裹，購買支出已經在包裹總金額中算過一次了，這裡不能重複加總！
            if (inv.buyDate && isDateInRange(inv.buyDate) && !inv.bulkRecordId) {
                if (filterType === 'all' || filterType === 'expense') {
                    items.push({ ...inv, _virtualId: `${inv.id}_buy`, _type: 'expense', _displayPrice: inv.buyPrice, _displayDate: inv.buyDate });
                }
                expense += (Number(inv.buyPrice) || 0);
            }
            if (inv.sellPrice > 0 && inv.sellDate && isDateInRange(inv.sellDate)) {
                if (filterType === 'all' || filterType === 'income') {
                    items.push({ ...inv, _virtualId: `${inv.id}_sell`, _type: 'income', _displayPrice: inv.sellPrice, _displayDate: inv.sellDate });
                }
                income += (Number(inv.sellPrice) || 0);
            }
        });

        (bulkRecords || []).forEach(record => {
            if (record.buyDate && isDateInRange(record.buyDate)) {
                if (filterType === 'all' || filterType === 'expense') {
                    items.push({
                        id: `bulk_total_${record.id}`, _virtualId: `bulk_total_${record.id}`, _type: 'expense',
                        _isBulkHeader: true, name: record.name, _displayPrice: record.totalAmount, _displayDate: record.buyDate,
                        image: record.image, originalRecord: record
                    });
                }
                expense += (Number(record.totalAmount) || 0);
            }
            
            (record.items || []).forEach((item, idx) => {
                const qty = Number(item.quantity) || 1;
                const totalSellPrice = (Number(item.sellPrice) || 0) * qty;
                if (item.isMisc && totalSellPrice > 0 && item.sellDate && isDateInRange(item.sellDate)) {
                    if (filterType === 'all' || filterType === 'income') {
                        items.push({
                            id: `misc_${record.id}_${idx}`, _virtualId: `misc_${record.id}_${idx}`, _type: 'income',
                            name: `[雜物] ${item.name} (${record.name})`, _displayPrice: totalSellPrice, _displayDate: item.sellDate,
                            note: `數量: ${qty}`, isMisc: true, originalRecord: record
                        });
                    }
                    income += totalSellPrice;
                }
            });
        });

        items.sort((a, b) => new Date(b._displayDate) - new Date(a._displayDate));
        return { displayItems: items, totalIncome: income, totalExpense: expense };
    }, [inventory, year, month, filterType, bulkRecords, dateFilterMode, startDate, endDate]);

    return (
        <div className="bg-gray-50 min-h-screen pb-20">
             <div className="bg-white/80 backdrop-blur-md border-b border-gray-200/50 sticky top-14 sm:top-16 z-20 shadow-sm px-2 sm:px-4 py-2 sm:py-3 space-y-2 sm:space-y-3">
                 <div className="flex justify-center items-center relative">
                     <div className="relative">
                         <select value={dateFilterMode} onChange={(e) => setDateFilterMode(e.target.value)} className="appearance-none bg-indigo-50 border border-indigo-100 text-indigo-700 font-bold py-1.5 pl-4 pr-8 rounded-full focus:outline-none focus:ring-2 focus:ring-indigo-200 transition-all cursor-pointer text-xs shadow-sm">
                             <option value="month">篩選年月</option><option value="year">只篩選年</option><option value="range">自訂日期範圍</option>
                         </select>
                         <ChevronDown className="w-3 h-3 text-indigo-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                     </div>
                     {dateFilterMode !== 'range' && (
                         <button onClick={() => { setYear(new Date().getFullYear()); setMonth(new Date().getMonth() + 1); }} className="absolute right-0 p-1.5 bg-gray-100 hover:bg-gray-200 text-indigo-600 rounded-lg transition-colors"><Calendar className="w-4 h-4" /></button>
                     )}
                 </div>

                 {dateFilterMode === 'range' ? (
                     <div className="flex items-center gap-2">
                         <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full bg-gray-50 border border-gray-200 py-1.5 px-2 rounded-lg outline-none text-xs font-bold text-gray-700 focus:ring-1 focus:ring-indigo-200" />
                         <span className="text-gray-400 font-bold">-</span>
                         <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full bg-gray-50 border border-gray-200 py-1.5 px-2 rounded-lg outline-none text-xs font-bold text-gray-700 focus:ring-1 focus:ring-indigo-200" />
                     </div>
                 ) : (
                     <div className="flex justify-between items-center">
                         <button onClick={handlePrev} className="p-2 -ml-2 text-gray-400 hover:text-gray-600 rounded-full"><ChevronLeft className="w-6 h-6" /></button>
                         <div className="flex gap-2 items-center">
                             <div className="relative">
                                 <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="appearance-none bg-gray-100 border border-transparent text-gray-700 font-bold py-1.5 pl-3 pr-7 rounded-lg text-sm">
                                     {availableYears.map(y => <option key={y} value={y}>{y}年</option>)}
                                 </select>
                                 <ChevronDown className="w-3 h-3 text-gray-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                             </div>
                             {dateFilterMode === 'month' && (
                                 <div className="relative">
                                     <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="appearance-none bg-gray-100 border border-transparent text-gray-700 font-bold py-1.5 pl-3 pr-7 rounded-lg text-sm">
                                         {Array.from({length: 12}, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}月</option>)}
                                     </select>
                                     <ChevronDown className="w-3 h-3 text-gray-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                                 </div>
                             )}
                         </div>
                         <button onClick={handleNext} className="p-2 -mr-2 text-gray-400 hover:text-gray-600 rounded-full"><ChevronRight className="w-6 h-6" /></button>
                     </div>
                 )}
             </div>

             <div className="grid grid-cols-2 gap-4 p-4">
                 <button onClick={() => setFilterType(filterType === 'income' ? 'all' : 'income')} className={`bg-white p-4 rounded-2xl shadow-sm border transition-all ${filterType === 'income' ? 'border-green-500 ring-1 ring-green-500' : 'border-transparent'}`}>
                     <div className="text-xs text-gray-400 font-bold mb-1">收入</div><div className="text-2xl font-black text-green-600">${totalIncome.toLocaleString()}</div>
                 </button>
                 <button onClick={() => setFilterType(filterType === 'expense' ? 'all' : 'expense')} className={`bg-white p-4 rounded-2xl shadow-sm border transition-all ${filterType === 'expense' ? 'border-red-500 ring-1 ring-red-500' : 'border-transparent'}`}>
                     <div className="text-xs text-gray-400 font-bold mb-1">支出</div><div className="text-2xl font-black text-gray-800">${totalExpense.toLocaleString()}</div>
                 </button>
             </div>

             <div className="px-4 space-y-3">
                {displayItems.map(item => {
                    const card = cardMap[String(item.cardId)];
                    const isIncome = item._type === 'income';
                    const dateObj = new Date(item._displayDate);
                    
                    const cardSeries = card ? seriesMap[String(card.seriesId)] : null;
                    const cardBatch = card ? batchMap[String(card.batchId)] : null;
                    const typeObj = card?.type ? typeMap[String(card.type)] : null;
                    const channelObj = card?.channel ? channelMap[String(card.channel)] : null;
                    
                    const displayTitle = card ? [cardSeries?.shortName || cardSeries?.name, [(channelObj?.shortName || channelObj?.name), cardBatch?.batchNumber].filter(Boolean).join(''), typeObj?.shortName || typeObj?.name].filter(Boolean).join(' ') : '';
                    // 🌟 修正：如果是雜物，也顯示為 [包裹] 品名，與盤收標頭一致 (同時修復雜物顯示為"未命名卡片"的問題)
                    const finalName = item._isBulkHeader ? `[包裹] ${item.name}` : (item.isMisc ? `[包裹] ${item.name}` : (displayTitle || '未命名卡片'));

                    return (
                        <div key={item._virtualId} 
                            onMouseDown={() => startPress(item)} onMouseUp={cancelPress} onMouseLeave={cancelPress}
                            onTouchStart={() => startPress(item)} onTouchEnd={cancelPress}
                            onContextMenu={(e) => { e.preventDefault(); cancelPress(); hasLongPressed.current = true; setItemToDelete(item); }}
                            onClick={(e) => {
                                if (hasLongPressed.current) return e.preventDefault();
                                if (item._isBulkHeader && item.originalRecord && onEditBulkRecord) onEditBulkRecord(item.originalRecord);
                                else if (card) setViewingCard(card);
                            }} 
                            className="bg-white p-3 rounded-xl flex items-center justify-between shadow-sm active:scale-[0.99] transition-transform cursor-pointer hover:border-indigo-300 border border-transparent select-none"
                        >
                            <div className="flex items-center gap-3 overflow-hidden">
                                <div className="flex flex-col items-center justify-center w-11 h-11 bg-gray-100 rounded-lg flex-shrink-0">
                                    <span className="text-[8px] text-gray-400 font-bold leading-none">{dateObj.getFullYear()}</span>
                                    <span className="text-[10px] text-gray-500 font-bold leading-none mt-0.5">{dateObj.getMonth() + 1}月</span>
                                    <span className="text-sm text-gray-800 font-black leading-none mt-0.5">{dateObj.getDate()}</span>
                                </div>
                                <div className="w-9 aspect-[2/3] bg-gray-200 rounded-md overflow-hidden flex-shrink-0 border border-gray-100 relative">
                                    {item.isMisc ? (
                                        <div className="w-full h-full bg-orange-50 flex items-center justify-center text-orange-500"><Tag className="w-5 h-5" /></div>
                                    ) : item._isBulkHeader ? (
                                        item.image ? <Image src={item.image} alt={item.name} fill sizes="50px" className="object-cover pointer-events-none" unoptimized={true} />: <div className="w-full h-full bg-indigo-100 flex items-center justify-center text-indigo-500"><Package className="w-5 h-5" /></div>
                                    ) : (card && card.image ? (
                                        <Image src={card.image} alt="卡片" fill className="object-cover pointer-events-none" sizes="50px" unoptimized={true} />
                                    ) : (
                                        <div className="w-full h-full bg-gray-200 flex items-center justify-center text-gray-300"><ImageIcon className="w-4 h-4" /></div>
                                    ))}
                                    {isIncome && <div className="absolute inset-0 bg-green-900/30 flex items-center justify-center"><div className="bg-green-500 text-white text-[8px] font-bold px-1 rounded shadow-sm">SOLD</div></div>}
                                </div>
                                <div className="min-w-0 flex flex-col justify-center">
                                    <div className="font-bold text-gray-800 text-xs truncate">{finalName}</div>
                                    {!item._isBulkHeader && !item.isMisc && cardBatch?.name && <div className="text-[10px] text-gray-500 truncate mb-0.5">{cardBatch.name}</div>}
                                    <div className="text-[10px] text-gray-400 flex items-center gap-1">
                                        {isIncome && <span className="text-[9px] bg-green-100 text-green-600 px-1 rounded-sm font-bold">售出</span>}
                                        <span className="truncate">{item.note || (item._isBulkHeader ? '批量購入支出' : (isIncome ? '出售' : '購買'))}</span>
                                    </div>
                                    {item.albumQuantity > 0 && (
                                        <div className="text-[9px] text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded w-fit mt-0.5 flex items-center gap-1">
                                            <Disc className="w-2.5 h-2.5" /> 含專 x{item.albumQuantity}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className={`text-sm font-black whitespace-nowrap ml-2 ${isIncome ? 'text-green-600' : 'text-gray-900'}`}>
                                {isIncome ? '+' : '-'}${Number(item._displayPrice).toLocaleString()}
                            </div>
                        </div>
                    )
                })}
             </div>

             {itemToDelete && (
                <Modal title="確認刪除" onClose={() => setItemToDelete(null)} className="max-w-sm" footer={
                    <div className="flex gap-2 w-full">
                        <button onClick={() => setItemToDelete(null)} className="flex-1 py-3 rounded-xl border font-bold text-gray-500">取消</button>
                        <button onClick={() => {
                            if (itemToDelete._isBulkHeader && onDeleteBulkRecord) onDeleteBulkRecord(itemToDelete.originalRecord.id);
                            else if (onDeleteInventory) onDeleteInventory(itemToDelete.id);
                            setItemToDelete(null);
                        }} className="flex-1 py-3 rounded-xl bg-red-500 text-white font-bold">確定刪除</button>
                    </div>
                }>
                    <div className="p-6 text-center text-gray-600 text-sm">
                        {itemToDelete._isBulkHeader 
                            ? `確定要刪除包裹「${itemToDelete.name}」嗎？\n⚠️這將同時刪除內含的所有卡片庫存！` 
                            : `確定要刪除這筆紀錄嗎？\n金額: $${itemToDelete._displayPrice}`}
                    </div>
                </Modal>
            )}
        </div>
    );
}

function BulkTab({ cards, records, allRecords, onAdd, onEdit, onAddSet, inventory, series, batches, setInventory, setSales, members, onViewCard, setBulkRecords, uniqueSources, onRenameSource, onDeleteSource, onSyncData, subunits, types }) {
    const [viewMode, setViewMode] = useState('set'); // 'bulk' | 'album' | 'set'
    const [filterStatus, setFilterStatus] = useState('All');
    const [filterSource, setFilterSource] = useState('All');
    const [filterSetSeries, setFilterSetSeries] = useState('All');
    const [albumPrices, setAlbumPrices] = useState({});
    const [viewingAlbum, setViewingAlbum] = useState(null);
    const [showBatchSelector, setShowBatchSelector] = useState(false);
    
    // 🌟 新增：批次選擇器的篩選狀態
    const [filterBatchSubunit, setFilterBatchSubunit] = useState('All');
    const [filterBatchSeriesType, setFilterBatchSeriesType] = useState('All');
    const [filterBatchSeries, setFilterBatchSeries] = useState('All');
    
    const availableSubunits = useMemo(() => {
        const usedNames = new Set((series || []).map(s => s.subunit).filter(Boolean));
        const subunitSortMap = new Map();
        (subunits || []).forEach(s => {
            if (s.sortOrder !== undefined && s.sortOrder !== null) {
                subunitSortMap.set(s.name, s.sortOrder);
            }
        });
        return Array.from(usedNames).map(name => ({
            id: name,
            name: name,
            sortOrder: subunitSortMap.has(name) ? subunitSortMap.get(name) : 999
        })).sort((a, b) => a.sortOrder - b.sortOrder);
    }, [series, subunits]);

    // 🌟 批次選擇器的篩選邏輯
    const uniqueSeriesTypes = useMemo(() => {
        let list = series || [];
        if (filterBatchSubunit !== 'All') list = list.filter(s => s.subunit === filterBatchSubunit);
        return [...new Set(list.map(s => s.type).filter(Boolean))];
    }, [series, filterBatchSubunit]);

    const availableSeriesList = useMemo(() => {
        let list = [...(series || [])]; // 🌟 確保複製陣列，避免改動到原始資料導致畫面錯誤
        if (filterBatchSubunit !== 'All') list = list.filter(s => s.subunit === filterBatchSubunit);
        if (filterBatchSeriesType !== 'All') list = list.filter(s => s.type === filterBatchSeriesType);
        
        // 🌟 使用 getTime() 確保在所有瀏覽器環境 (含 Safari/iOS) 都能正確比較日期
        return list.sort((a, b) => {
            const dateA = a.date ? new Date(a.date).getTime() : 253402214400000; // 如果沒日期放到最後
            const dateB = b.date ? new Date(b.date).getTime() : 253402214400000;
            return dateA - dateB;
        });
    }, [series, filterBatchSeriesType, filterBatchSubunit]);

    const filteredBatches = useMemo(() => {
        return (batches || []).filter(b => {
            const s = (series || []).find(ser => String(ser.id) === String(b.seriesId));
            if (filterBatchSubunit !== 'All' && (!s || s.subunit !== filterBatchSubunit)) return false;
            if (filterBatchSeries !== 'All') {
                if (String(b.seriesId) !== String(filterBatchSeries)) return false;
            } else if (filterBatchSeriesType !== 'All') {
                if (!s || s.type !== filterBatchSeriesType) return false;
            }
            return true;
        }).sort((a, b) => {
            // 🌟 完美對齊圖鑑的批次排序邏輯：1. 子類排序 -> 2. 發行日期 -> 3. 名稱
            const typeA = (types || []).find(t => String(t.id) === String(a.type) || t.name === a.type);
            const typeB = (types || []).find(t => String(t.id) === String(b.type) || t.name === b.type);
            const sortOrderA = typeA ? (Number(typeA.sortOrder) || 0) : 999;
            const sortOrderB = typeB ? (Number(typeB.sortOrder) || 0) : 999;
            
            if (sortOrderA !== sortOrderB) {
                return sortOrderA - sortOrderB;
            }
            
            const dateA = a.date ? new Date(a.date).getTime() : 253402214400000;
            const dateB = b.date ? new Date(b.date).getTime() : 253402214400000;
            if (dateA !== dateB) return dateA - dateB;
            const nameA = a.name || '';
            const nameB = b.name || '';
            return nameA.localeCompare(nameB, 'zh-TW', { numeric: true });
        });
    }, [batches, series, filterBatchSeriesType, filterBatchSeries, filterBatchSubunit, types]);

    useEffect(() => {
        if (filterBatchSeries !== 'All') {
            const s = (series || []).find(ser => String(ser.id) === String(filterBatchSeries));
            if (s) {
                if (filterBatchSeriesType !== 'All' && s.type !== filterBatchSeriesType) {
                    setFilterBatchSeries('All');
                }
                if (filterBatchSubunit !== 'All' && s.subunit !== filterBatchSubunit) {
                    setFilterBatchSeries('All');
                }
            }
        }
    }, [filterBatchSeries, filterBatchSeriesType, filterBatchSubunit, series]);

    // 🌟 讀取記憶的售價
    useEffect(() => {
        try {
            const saved = localStorage.getItem('album_prices');
            if (saved) setAlbumPrices(JSON.parse(saved));
        } catch (e) { console.error(e); }
    }, []);

    const availableStatuses = ['未發貨', '囤貨', '到貨'];
    const availableSources = useMemo(() => [...new Set((allRecords || records || []).map(r => r.source).filter(Boolean))], [allRecords, records]);

    const setRecords = useMemo(() => (records || []).filter(r => r.items?.some(i => i.isSet)), [records]);
    const bulkRecordsOnly = useMemo(() => (records || []).filter(r => !r.items?.some(i => i.isSet)), [records]);

    // 🌟 計算套收紀錄中包含的所有系列
    const availableSetSeries = useMemo(() => {
        const seriesIds = new Set();
        setRecords.forEach(r => {
            (r.items || []).forEach(item => {
                if (item.cardId) {
                    const card = (cards || []).find(c => String(c.id) === String(item.cardId));
                    if (card && card.seriesId) seriesIds.add(String(card.seriesId));
                }
            });
        });
        return (series || []).filter(s => seriesIds.has(String(s.id)));
    }, [setRecords, cards, series]);

    const filteredRecords = useMemo(() => {
        const sourceRecords = viewMode === 'set' ? setRecords : bulkRecordsOnly;
        const filtered = (sourceRecords || []).filter(r => {
            if (filterStatus !== 'All' && r.status !== filterStatus) return false;
            if (filterSource !== 'All' && r.source !== filterSource) return false;
            if (viewMode === 'set' && filterSetSeries !== 'All') {
                const hasMatch = (r.items || []).some(item => {
                    const card = (cards || []).find(c => String(c.id) === String(item.cardId));
                    return card && String(card.seriesId) === String(filterSetSeries);
                });
                if (!hasMatch) return false;
            }
            return true;
        });
        return [...filtered].sort((a, b) => new Date(b.buyDate || 0) - new Date(a.buyDate || 0));
    }, [setRecords, bulkRecordsOnly, filterStatus, filterSource, viewMode, filterSetSeries, cards]);

    const getStatusStyle = (status) => {
        switch(status) {
            case '到貨': return 'bg-green-50 text-green-600 border-green-200';
            case '囤貨': return 'bg-blue-50 text-blue-600 border-blue-200';
            case '未發貨': return 'bg-orange-50 text-orange-600 border-orange-200';
            default: return 'bg-gray-50 text-gray-500 border-gray-200';
        }
    };

    const RenderFilterSection = ({ label, options, current, onChange, mapName, disableToggleOff = false }) => (
     <div className="flex items-center gap-3 overflow-hidden">
        <span className="text-[10px] font-bold text-gray-400 whitespace-nowrap min-w-fit">{label}</span>
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 flex-1">
            {(options || []).map(opt => {
                const id = typeof opt === 'object' ? opt.id : opt;
                const name = mapName ? mapName(opt) : opt;
                const isSelected = current === id;
                return (
                    // 🌟 換成最安全的原生 button，避免 FilterTagItem 遺失報錯
                    <button 
                        key={id}
                        onClick={() => {
                            if (disableToggleOff && isSelected) return; 
                            onChange(isSelected ? 'All' : id);
                        }}
                        className={`px-3 py-1 text-xs rounded-full whitespace-nowrap border select-none transition-all ${
                            isSelected ? 'bg-indigo-600 border-indigo-600 text-white font-bold' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                        }`}
                    >
                        {name}
                    </button>
                )
            })}
        </div>
     </div>
  );

    // Album Overview Logic
    const albumInventory = useMemo(() => {
        const map = {};
        (inventory || []).forEach(inv => {
            if (inv.albumQuantity > 0 && inv.albumId) {
                if (!map[inv.albumId]) map[inv.albumId] = { 
                    '未拆': { count: 0, items: [] },
                    '空專': { count: 0, items: [] }
                };
                const status = inv.albumStatus === '空專' ? '空專' : '未拆';
                map[inv.albumId][status].count += inv.albumQuantity;
                map[inv.albumId][status].items.push(inv);
            }
        });
        return map;
    }, [inventory]);

    const albumList = useMemo(() => {
        return Object.keys(albumInventory).map(albumId => {
            const s = (series || []).find(ser => ser.id === albumId);
            return {
                id: albumId,
                name: s?.name || '未知專輯',
                date: s?.date || '9999-12-31',
                image: s?.image,
                stats: albumInventory[albumId]
            };
        }).sort((a, b) => new Date(a.date) - new Date(b.date));
    }, [albumInventory, series]);

    // 🌟 確保專輯詳情頁面的資料與庫存同步 (當刪除庫存時，強制更新 viewingAlbum)
    useEffect(() => {
        if (viewingAlbum) {
            const updated = albumList.find(a => a.id === viewingAlbum.id);
            if (updated) {
                setViewingAlbum(updated);
            } else {
                 // 若該專輯已無庫存，更新為空狀態以免報錯
                 setViewingAlbum(prev => ({
                     ...prev,
                     stats: { '未拆': { count: 0, items: [] }, '空專': { count: 0, items: [] } }
                 }));
            }
        }
    }, [albumList, viewingAlbum]);

    const handleSellAlbum = async (albumId) => {
        const status = activeAlbumStatus[albumId] || '未拆'; // 🌟 取得當前狀態
        const priceKey = `${albumId}_${status}`;
        const price = Number(albumPrices[priceKey]) || 0;
        
        const targetItems = albumInventory[albumId]?.[status]?.items || [];
        const targetItem = targetItems.find(i => i.albumQuantity > 0);
        
        if (!targetItem) return alert(`「${status}」庫存不足！`);

        const newQuantity = targetItem.albumQuantity - 1;
        const updatedItem = { ...targetItem, albumQuantity: newQuantity };
        
        setInventory(prev => prev.map(i => i.id === targetItem.id ? updatedItem : i));
        await supabase.from('ui_inventory').update({ album_quantity: newQuantity }).eq('id', targetItem.id);

        const newSale = {
            id: Date.now().toString(),
            cardId: targetItem.cardId,
            price: price,
            quantity: 1,
            date: new Date().toISOString().split('T')[0],
            note: `售出專輯 (${status}): ${(series || []).find(s => s.id === albumId)?.name || '未知'}`,
            color: 'bg-purple-500'
        };
        setSales(prev => [...prev, newSale]);
        await supabase.from('ui_sales').insert(toSnakeCase(newSale));
        
        // 🌟 記憶售價
        const newPrices = { ...albumPrices, [priceKey]: price };
        setAlbumPrices(newPrices);
        localStorage.setItem('album_prices', JSON.stringify(newPrices));
    };

    return (
        <div className="space-y-6 pb-24">
            <div className="px-2 space-y-2">
                <div className="bg-gray-100 p-1 rounded-lg flex items-center w-fit">
                    <button onClick={() => setViewMode('set')} className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${viewMode === 'set' ? 'bg-white shadow text-black' : 'text-gray-400'}`}>套收</button>
                    <button onClick={() => setViewMode('bulk')} className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${viewMode === 'bulk' ? 'bg-white shadow text-black' : 'text-gray-400'}`}>盤收</button>
                    <button onClick={() => setViewMode('album')} className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${viewMode === 'album' ? 'bg-white shadow text-black' : 'text-gray-400'}`}>專輯</button>
                </div>
                <div className="flex justify-between items-center">
                    <h2 className="font-bold text-xl flex items-center gap-2"><Package className="w-6 h-6 text-indigo-600" />{viewMode === 'set' ? '套收管理' : viewMode === 'bulk' ? '盤收管理' : '專輯管理'}</h2>
                    {(viewMode === 'bulk' || viewMode === 'set') && (
                        <div className="flex gap-2">
                            {viewMode === 'bulk' && (
                                <button onClick={onSyncData} className="bg-white text-indigo-600 border border-indigo-100 px-3 py-2 rounded-full text-xs font-bold shadow-sm hover:bg-indigo-50 transition-all flex items-center gap-1">
                                    <RefreshCw className="w-3.5 h-3.5" /> 同步資料
                                </button>
                            )}
                            <button onClick={viewMode === 'set' ? () => setShowBatchSelector(true) : onAdd} className="bg-black text-white px-4 py-2 rounded-full text-xs font-bold shadow-md hover:bg-gray-800 transition-all flex items-center gap-1"><Plus className="w-3 h-3" /> 新增</button>
                        </div>
                    )}
                </div>
            </div>
            
            {viewMode === 'set' ? (
                <>
                    <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm space-y-3">
                        <RenderFilterSection label="狀態" options={availableStatuses} current={filterStatus} onChange={setFilterStatus} />
                        {availableSources.length > 0 && <RenderFilterSection label="來源" options={availableSources} current={filterSource} onChange={setFilterSource} />}
                        {availableSetSeries.length > 0 && <RenderFilterSection label="系列" options={availableSetSeries} current={filterSetSeries} onChange={setFilterSetSeries} mapName={s => s.name} />}
                    </div>
                    <div className="space-y-3">
                        {filteredRecords.map(record => (
                            <div key={record.id} onClick={() => onEdit(record)} className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm flex items-center gap-4 cursor-pointer hover:border-indigo-300 group active:scale-95 transition-transform">
                                <div className="w-12 h-12 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0 border relative">
                                    {record.image ? <Image src={record.image} alt={record.name || 'set'} fill sizes="48px" className="object-cover" unoptimized={true} /> : <Package className="w-6 h-6 text-gray-300 m-auto mt-3" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="font-bold text-gray-800 text-sm truncate">{record.name}</div>
                                    <div className="text-[10px] text-gray-500 font-bold flex items-center gap-1 truncate mt-0.5"><span className="text-red-500">${Number(record.totalAmount).toLocaleString()}</span><span>· {(record.items || []).filter(i => !i.isMisc && !i.isAlbum).length} 張卡片</span></div>
                                </div>
                                <div className="flex gap-1.5 flex-wrap flex-shrink-0">
                                    {record.status && <span className={`text-[9px] px-1.5 py-0.5 rounded border font-bold ${getStatusStyle(record.status)}`}>{record.status}</span>}
                                    {record.source && <span className="text-[9px] bg-gray-50 text-gray-500 px-1.5 py-0.5 rounded border border-gray-200 font-bold truncate max-w-[80px]">{record.source}</span>}
                                </div>
                                <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-indigo-500 transition-colors" />
                            </div>
                        ))}
                        {filteredRecords.length === 0 && <div className="text-center py-10 text-gray-400">目前沒有符合條件的套收記錄</div>}
                    </div>
                </>
            ) : viewMode === 'bulk' ? (
                <>
                    <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm space-y-3">
                        <RenderFilterSection label="狀態" options={availableStatuses} current={filterStatus} onChange={setFilterStatus} />
                        {availableSources.length > 0 && <RenderFilterSection label="來源" options={availableSources} current={filterSource} onChange={setFilterSource} />}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                        {filteredRecords.map(record => (
                            <div key={record.id} onClick={() => onEdit(record)} className="cursor-pointer group active:scale-95 transition-transform bg-white rounded-2xl p-2 border border-transparent shadow-sm hover:border-indigo-200 hover:shadow-md flex flex-col h-full">
                                <div className="aspect-square bg-gray-200 rounded-xl overflow-hidden relative border border-gray-100 mb-2 flex-shrink-0">
                                    {/* 🌟 限制包裹清單的縮圖檔案大小 */}
                                    {record.image ? <Image src={record.image} alt={record.name || 'bulk'} fill sizes="150px" className="object-cover pointer-events-none" unoptimized={true} /> : <div className="w-full h-full flex items-center justify-center text-gray-400 bg-gray-100"><Package className="w-10 h-10 opacity-30" /></div>}
                                </div>
                                <div className="px-1 flex flex-col flex-1 justify-between">
                                    <div>
                                        <div className="font-bold text-sm text-gray-800 leading-tight line-clamp-2 mb-1">{record.name}</div>
                                        <div className="text-[10px] text-gray-500 font-bold flex items-center gap-1 truncate mb-1.5"><span className="text-red-500">${Number(record.totalAmount).toLocaleString()}</span><span>· {(record.items || []).length} 張卡片</span></div>
                                    </div>
                                    <div className="flex gap-1.5 flex-wrap mt-auto pt-1">
                                        {record.status && <span className={`text-[9px] px-1.5 py-0.5 rounded border font-bold ${getStatusStyle(record.status)}`}>{record.status}</span>}
                                        {record.source && <span className="text-[9px] bg-gray-50 text-gray-500 px-1.5 py-0.5 rounded border border-gray-200 font-bold truncate max-w-[80px]">{record.source}</span>}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            ) : (
                <>
                    <div className="space-y-3 px-2">
                        {albumList.map(album => (
                            <div key={album.id} onClick={() => setViewingAlbum(album)} className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm flex items-center gap-4 cursor-pointer hover:border-indigo-300 group active:scale-95 transition-transform">
                                <div className="w-12 h-12 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0 border">
                                    {album.image ? <Image src={album.image} alt={album.name} width={48} height={48} className="w-full h-full object-cover" unoptimized={true} /> : <Disc className="w-6 h-6 text-gray-300 m-auto" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="font-bold text-gray-800 text-sm truncate">{album.name}</div>
                                    <div className="text-xs text-gray-500 flex gap-4 mt-1">
                                        <span>未拆: <span className="font-bold text-indigo-600">{album.stats['未拆']?.count || 0}</span></span>
                                        <span>空專: <span className="font-bold text-gray-600">{album.stats['空專']?.count || 0}</span></span>
                                    </div>
                                </div>
                                <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-indigo-500 transition-colors" />
                            </div>
                        ))}
                        {albumList.length === 0 && <div className="text-center py-10 text-gray-400">目前沒有專輯庫存</div>}
                    </div>
                    {viewingAlbum && <AlbumDetailModal album={viewingAlbum} onClose={() => setViewingAlbum(null)} cards={cards} members={members} series={series} setInventory={setInventory} setSales={setSales} albumPrices={albumPrices} setAlbumPrices={setAlbumPrices} onViewCard={onViewCard} bulkRecords={allRecords} setBulkRecords={setBulkRecords} uniqueSources={uniqueSources} onRenameSource={onRenameSource} onDeleteSource={onDeleteSource} onOpenBulkRecord={(bulkId) => {
                        const record = (allRecords || []).find(r => String(r.id) === String(bulkId));
                        if (record) {
                            setViewingAlbum(null);
                            onEdit(record);
                        }
                    }} />}
                </>
            )}

            {showBatchSelector && (
                <Modal title="選擇批次建立套收" onClose={() => setShowBatchSelector(false)} className="max-w-3xl" mobileFullScreen={true}>
                    <div className="flex flex-col h-full sm:max-h-[70vh]">
                        <div className="p-4 border-b border-gray-100 space-y-3 flex-shrink-0 bg-white sticky top-0 z-10">
                            {availableSubunits.length > 0 && (
                                <RenderFilterSection 
                                    label="分隊" 
                                    options={[{ id: 'All', name: '全部' }, ...availableSubunits]} 
                                    current={filterBatchSubunit} 
                                    onChange={val => {
                                        setFilterBatchSubunit(val);
                                        setFilterBatchSeriesType('All');
                                        setFilterBatchSeries('All');
                                    }} 
                                    mapName={s => s.name}
                                    disableToggleOff={true}
                                />
                            )}
                            <RenderFilterSection 
                                label="系列類型" 
                                options={[{ id: 'All', name: '全部' }, ...uniqueSeriesTypes.map(t => ({ id: t, name: t }))]} 
                                current={filterBatchSeriesType} 
                                onChange={val => {
                                    setFilterBatchSeriesType(val);
                                    if (val === 'All') setFilterBatchSeries('All');
                                }} 
                                mapName={t => t.name}
                                disableToggleOff={true}
                            />
                            <RenderFilterSection 
                                label="系列" 
                                options={[{ id: 'All', name: '全部' }, ...availableSeriesList]} 
                                current={filterBatchSeries} 
                                onChange={setFilterBatchSeries} 
                                mapName={s => s.name}
                                disableToggleOff={true}
                            />
                        </div>
                        <div className="p-4 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4 overflow-y-auto no-scrollbar flex-1 bg-gray-50">
                            {filteredBatches.map(b => (
                                <div key={b.id} className="flex flex-col items-center gap-1 cursor-pointer group hover:scale-95 transition-transform active:scale-90">
                                    <BatchItem 
                                        batch={b} 
                                        isSelected={false} 
                                        onClick={() => {
                                            setShowBatchSelector(false);
                                            const batchCards = (cards || []).filter(c => String(c.batchId) === String(b.id));
                                            onAddSet(b, batchCards);
                                        }} 
                                        onLongPress={() => {}} 
                                    />
                                </div>
                            ))}
                            {filteredBatches.length === 0 && <div className="col-span-full py-10 text-center text-gray-400">目前沒有符合條件的批次</div>}
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}

function AlbumDetailModal({ album, onClose, cards, members, series, setInventory, setSales, albumPrices, setAlbumPrices, onViewCard, bulkRecords, setBulkRecords, uniqueSources, onRenameSource, onDeleteSource, onOpenBulkRecord }) {
    if (!album) return null;

    const [activeStatus, setActiveStatus] = useState('未拆');
    const [isExpanded, setIsExpanded] = useState(false);
    const swipeHandlers = useSwipeToClose(onClose);
    const [activeModal, setActiveModal] = useState(null);
    const [tempInvData, setTempInvData] = useState(null);

    const allItems = [
        ...(album.stats['未拆']?.items || []).map(i => ({...i, _status: '未拆'})),
        ...(album.stats['空專']?.items || []).map(i => ({...i, _status: '空專'}))
    ].sort((a, b) => new Date(b.buyDate || 0) - new Date(a.buyDate || 0));

    const displayedItems = isExpanded ? allItems : allItems.slice(0, 6);

    const handleSellAlbum = async () => {
        const priceKey = `${album.id}_${activeStatus}`;
        const price = Number(albumPrices[priceKey]) || 0;
        
        const targetItems = album.stats[activeStatus]?.items || [];
        const targetItem = targetItems.find(i => i.albumQuantity > 0);
        
        if (!targetItem) return alert(`「${activeStatus}」庫存不足！`);

        const newQuantity = targetItem.albumQuantity - 1;
        const updatedItem = { ...targetItem, albumQuantity: newQuantity };
        
        setInventory(prev => prev.map(i => i.id === targetItem.id ? updatedItem : i));
        await supabase.from('ui_inventory').update({ album_quantity: newQuantity }).eq('id', targetItem.id);

        const newSale = {
            id: Date.now().toString(),
            cardId: targetItem.cardId,
            price: price,
            quantity: 1,
            date: new Date().toISOString().split('T')[0],
            note: `售出專輯 (${activeStatus}): ${album.name}`,
            color: 'bg-purple-500'
        };
        setSales(prev => [...prev, newSale]);
        await supabase.from('ui_sales').insert(toSnakeCase(newSale));
        
        const newPrices = { ...albumPrices, [priceKey]: price };
        setAlbumPrices(newPrices);
        localStorage.setItem('album_prices', JSON.stringify(newPrices));
        
        onClose();
    };

    const handleSaveInventory = async (data, callback) => {
        const isArray = Array.isArray(data);
        const items = isArray ? data : [data];
        
        const newItems = items.map(item => ({
            ...item,
            id: (!item.id || String(item.id).startsWith('temp_') || String(item.id).startsWith('sel_')) 
                ? `inv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` 
                : item.id,
            quantity: Number(item.quantity) || 1
        }));
  
        setInventory(prev => {
            let next = [...prev];
            newItems.forEach(itemWithMeta => {
                const { _originalId, ...newItem } = itemWithMeta;
                const idToFind = _originalId || newItem.id;
                let idx = next.findIndex(i => String(i.id) === String(idToFind));
                if (idx === -1 && newItem.id) idx = next.findIndex(i => String(i.id) === String(newItem.id));
                if (idx !== -1) next[idx] = newItem;
                else next.push(newItem);
            });
            return next;
        });
  
        const dbItems = newItems.map(({ _originalId, ...rest }) => toSnakeCase(rest));
        await supabase.from('ui_inventory').upsert(dbItems);
  
        if (bulkRecords && setBulkRecords) {
            // ... (sync logic same as CardDetailModal) ...
            // 簡化：這裡我們主要關注庫存更新，若有需要同步盤收紀錄，可參考 CardDetailModal 的完整邏輯
        }
  
        if (callback && newItems.length > 0) callback(newItems[0].id);
        setActiveModal(null);
        setTempInvData(null);
    };

    const handleDeleteInventory = async (invId) => {
        if(!confirm("確定要刪除這筆紀錄嗎？")) return;
        
        // 🌟 找出要刪除的項目 (檢查是否屬於盤收)
        const targetItem = allItems.find(i => i.id === invId);

        setInventory(prev => prev.filter(i => i.id !== invId));
        await supabase.from('ui_inventory').delete().eq('id', invId);

        // 🌟 如果這筆資料來自盤收，同步移除盤收紀錄內的該項目
        if (targetItem && targetItem.bulkRecordId && setBulkRecords) {
            setBulkRecords(prev => prev.map(record => {
                if (record.id === targetItem.bulkRecordId) {
                    const newItems = (record.items || []).filter(item => item.id !== invId);
                    // 背景同步更新資料庫
                    supabase.from('bulk_records').update({ items: newItems }).eq('id', record.id).then();
                    return { ...record, items: newItems };
                }
                return record;
            }));
        }

        setActiveModal(null);
        setTempInvData(null);
    };

    const priceKey = `${album.id}_${activeStatus}`;

    return (
        <div className="fixed inset-0 z-[250] bg-gray-50/50 backdrop-blur-xl flex flex-col animate-fade-in" {...swipeHandlers}>
            <div className="px-4 py-3 border-b border-gray-200/50 flex items-center justify-between bg-white/80 backdrop-blur-md z-10 sticky top-0">
                <button onClick={onClose} className="p-2 -ml-2 rounded-full hover:bg-gray-100"><ArrowLeft className="w-6 h-6 text-gray-700" /></button>
                <div className="font-bold text-lg">專輯詳情</div>
                <div className="w-10"></div> {/* Placeholder */}
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar bg-gray-50">
                <div className="bg-white p-6 mb-2 text-center border-b shadow-sm">
                    <div className="w-40 aspect-square mx-auto bg-gray-100 rounded-xl overflow-hidden border shadow-lg mb-4 relative">
                        <Image src={album.image} alt={album.name} fill priority unoptimized className="object-cover" />
                    </div>
                    <h2 className="text-xl font-bold text-gray-900 leading-snug mb-2">{album.name}</h2>
                    <div className="flex justify-center gap-3 mt-4">
                        <span className="text-sm font-bold text-blue-700 bg-blue-50 px-3 py-1 rounded-full border border-blue-100">
                            未拆庫存: {album.stats['未拆']?.count || 0}
                        </span>
                        <span className="text-sm font-bold text-gray-500 bg-gray-100 px-3 py-1 rounded-full border border-gray-200">
                            空專庫存: {album.stats['空專']?.count || 0}
                        </span>
                    </div>
                </div>

                <div className="p-4 pb-24">
                    <div className="mb-6 bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                        <div className="flex justify-between items-center mb-2">
                             <div className="flex items-center gap-2">
                                <div className="bg-purple-100 p-1.5 rounded-lg text-purple-600"><Coins className="w-4 h-4" /></div>
                                <div className="font-bold text-gray-800 text-sm">快速售出</div>
                            </div>
                            <div className="flex bg-gray-100 p-1 rounded-lg">
                                <button onClick={() => setActiveStatus('未拆')} className={`px-3 py-1 text-xs font-bold rounded-md ${activeStatus === '未拆' ? 'bg-white shadow' : 'text-gray-500'}`}>未拆</button>
                                <button onClick={() => setActiveStatus('空專')} className={`px-3 py-1 text-xs font-bold rounded-md ${activeStatus === '空專' ? 'bg-white shadow' : 'text-gray-500'}`}>空專</button>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="flex-1">
                                <label className="text-[10px] text-gray-400 font-bold ml-1 mb-0.5 block">售價</label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">$</span>
                                    <input type="number" placeholder="0" value={albumPrices[priceKey] || ''}
                                        onChange={e => {
                                            const newPrices = {...albumPrices, [priceKey]: e.target.value};
                                            setAlbumPrices(newPrices);
                                            localStorage.setItem('album_prices', JSON.stringify(newPrices));
                                        }}
                                        className="w-full bg-gray-50 border-none rounded-lg py-2 pl-6 pr-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-100 transition-all"
                                    />
                                </div>
                            </div>
                            <div className="flex-1">
                                <label className="text-[10px] text-gray-400 font-bold ml-1 mb-0.5 block invisible">操作</label>
                                <button onClick={handleSellAlbum} className="w-full bg-black text-white px-3 py-2 rounded-lg text-sm font-bold hover:bg-gray-800 transition-colors">售出 {activeStatus}</button>
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-between items-end mb-3 px-1 mt-6 border-t pt-4 border-dashed border-gray-200">
                        <h3 className="font-bold text-gray-500 text-sm uppercase tracking-wider">交易紀錄</h3>
                    </div>
                    <div className="space-y-3 mb-6">
                        {allItems.map(inv => (
                            <div 
                                key={inv.id} 
                                onClick={() => { setTempInvData(inv); setActiveModal('editInv'); }}
                                className="bg-white p-4 rounded-xl border shadow-sm flex justify-between items-center cursor-pointer active:scale-[0.99] transition-transform hover:border-indigo-300 group"
                            >
                                <div>
                                    <div className="text-sm font-bold text-gray-800 flex items-center gap-2">
                                        {inv.buyDate}
                                        {inv.sellPrice > 0 
                                            ? <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-bold">已售 x{inv.quantity}</span>
                                            : <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-bold">x{inv.quantity}</span>
                                        }
                                    </div>
                                    <div className="flex gap-2 mt-1 flex-wrap">
                                        {inv.status && <span className={`text-[10px] px-1.5 rounded ${inv.status === '到貨' ? 'bg-green-50 text-green-600' : inv.status === '囤貨' ? 'bg-indigo-50 text-indigo-600' : inv.status === '未發貨' ? 'bg-pink-50 text-pink-600' : 'bg-gray-50 text-gray-600'}`}>{inv.status}</span>}
                                        {inv.source && <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 rounded">{inv.source}</span>}
                                        <span className="text-xs text-gray-500">{inv.note || '無備註'}</span>
                                        <span className="text-[10px] bg-purple-50 text-purple-600 px-1.5 rounded border border-purple-100 flex items-center gap-1"><Disc className="w-3 h-3" /> {inv.albumStatus} x{inv.albumQuantity}</span>
                                    </div>
                                </div>
                                <div className="text-right flex flex-col items-end gap-0.5">
                                    <div className="text-sm font-bold text-red-600">
                                        <span className="text-[10px] text-red-400 font-bold mr-1">買</span>${inv.buyPrice}
                                    </div>
                                    {inv.sellPrice > 0 && (
                                        <div className="text-sm font-bold text-green-600">
                                            <span className="text-[10px] text-green-400 font-bold mr-1">賣</span>${inv.sellPrice}
                                        </div>
                                    )}
                                </div>
                                <Edit2 className="w-4 h-4 text-gray-300 absolute right-2 top-2 opacity-0 group-hover:opacity-100" />
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {activeModal === 'editInv' && (
                <Modal 
                    title={
                        <span className="flex items-center gap-2">
                            編輯紀錄
                            {tempInvData?.bulkRecordId && (
                                (() => {
                                    const parentBulkRecord = (bulkRecords || []).find(r => String(r.id) === String(tempInvData.bulkRecordId));
                                    const isParentSet = parentBulkRecord && (parentBulkRecord.isSetMode || parentBulkRecord.items?.some(i => i.isSet));
                                    return (
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onOpenBulkRecord && onOpenBulkRecord(tempInvData.bulkRecordId);
                                            }}
                                            className="text-[11px] bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full flex items-center gap-1 hover:bg-indigo-100 transition-colors tracking-normal font-bold"
                                        >
                                            <Package className="w-3 h-3" />
                                            {isParentSet ? '編輯套收' : '編輯盤收'}
                                        </button>
                                    );
                                })()
                            )}
                        </span>
                    }
                    headerAction={<button onClick={() => handleDeleteInventory(tempInvData.id)} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors" title="刪除紀錄"><Trash2 className="w-5 h-5" /></button>}
                    onClose={() => { setActiveModal(null); setTempInvData(null); }} 
                    className="max-w-sm"
                    footer={null} 
                    mobileFullScreen={true}
                >
                    <div className="flex flex-col h-full">
                        <InventoryForm 
                            initialData={tempInvData} 
                            onSave={handleSaveInventory} 
                            sourceOptions={uniqueSources}
                            uniqueSources={uniqueSources}
                            onRenameSource={onRenameSource}
                            onDeleteSource={onDeleteSource}
                            albums={series.filter(s => s.type === '專輯')}
                        />
                    </div>
                </Modal>
            )}
        </div>
    );
}

function MiniCardSelector({ cards, selectedItems, onConfirm, onClose, members, series, batches, channels, types, uniqueTypes, uniqueChannels, uniqueSeriesTypes, subunits }) {
    const [localItems, setLocalItems] = useState([...(selectedItems || [])]);

    const [cols, setCols] = useState(typeof window !== 'undefined' && window.innerWidth < 768 ? 4 : 8);
    const [detailLevel, setDetailLevel] = useState(2); // 🌟 修復致命錯誤：補上缺失的 detailLevel 狀態
    const [viewMode, setViewMode] = useState('all');

    const [filterSubunit, setFilterSubunit] = useState('All');
    const [filterMember, setFilterMember] = useState('All');
    const [filterSeriesType, setFilterSeriesType] = useState('All');
    const [filterSeries, setFilterSeries] = useState([]);
    const [filterBatches, setFilterBatches] = useState([]);
    const [filterType, setFilterType] = useState('All');
    const [filterChannel, setFilterChannel] = useState('All');
    const [showSeriesModal, setShowSeriesModal] = useState(false);

    // 🌟 1. 建立高效能字典 (與 CollectionTab 一致)
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

    // 🌟 2. 分隊篩選邏輯 (支援系列分隊判斷)
    const availableSubunits = useMemo(() => {
        const usedNames = new Set();
        (cards || []).forEach(c => {
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
    }, [cards, memberMap, seriesMap, subunits]);

    useEffect(() => {
        if (availableSubunits.length > 0) {
            const availableIds = availableSubunits.map(s => s.id);
            if (filterSubunit === 'All' || !availableIds.includes(filterSubunit)) {
                setFilterSubunit(availableSubunits[0].id);
            }
        } else {
            setFilterSubunit('All');
        }
    }, [availableSubunits, filterSubunit]);

    const subunitFilteredCards = useMemo(() => {
        if (filterSubunit === 'All') return cards || [];
        return (cards || []).filter(c => {
            const m = memberMap[String(c.memberId)];
            const s = seriesMap[String(c.seriesId)];
            return (m && m.subunit === filterSubunit) || (s && s.subunit === filterSubunit);
        });
    }, [cards, filterSubunit, memberMap, seriesMap]);

    const availableMembers = useMemo(() => {
        const ids = new Set(subunitFilteredCards.map(c => String(c.memberId)));
        return (members || []).filter(m => ids.has(String(m.id)));
    }, [subunitFilteredCards, members]);

    const availableTypes = useMemo(() => {
        const ids = new Set(subunitFilteredCards.map(c => String(c.type)).filter(Boolean));
        const currentTypes = (types || []).filter(t => ids.has(String(t.id)) || ids.has(String(t.name))); // 🌟 修正 D1 數字型別比對
        ids.forEach(id => {
            if (!currentTypes.some(t => String(t.id) === id || String(t.name) === id)) currentTypes.push({ id, name: id, shortName: '', sortOrder: 999 });
        });
        return currentTypes.sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0));
    }, [subunitFilteredCards, types]);

    const availableChannels = useMemo(() => {
        const ids = new Set(subunitFilteredCards.map(c => String(c.channel)).filter(Boolean));
        const currentChannels = (channels || []).filter(c => ids.has(String(c.id)) || ids.has(String(c.name))); // 🌟 修正 D1 數字型別比對
        ids.forEach(id => {
            if (!currentChannels.some(c => String(c.id) === id || String(c.name) === id)) currentChannels.push({ id, name: id, shortName: '' });
        });
        const freqMap = {};
        subunitFilteredCards.forEach(c => { if (c.channel) freqMap[String(c.channel)] = (freqMap[String(c.channel)] || 0) + 1; });
        return currentChannels.sort((a, b) => (freqMap[String(b.id)] || freqMap[String(b.name)] || 0) - (freqMap[String(a.id)] || freqMap[String(a.name)] || 0));
    }, [subunitFilteredCards, channels]);
    
    const availableSeriesTypes = useMemo(() => {
        const ids = new Set((cards || []).map(c => String(c.seriesId)));
        return [...new Set((series || []).filter(s => ids.has(String(s.id))).map(s => s.type).filter(Boolean))];
    }, [cards, series]);
    
    const availableSeriesList = useMemo(() => {
        let filtered = (series || []).filter(s => (cards || []).some(c => String(c.seriesId) === String(s.id)));
        if (filterSubunit !== 'All') {
            filtered = filtered.filter(s => s.subunit === filterSubunit);
        }
        if (filterSeriesType !== 'All') filtered = filtered.filter(s => s.type === filterSeriesType);
        return filtered.sort((a, b) => new Date(b.date || '1970-01-01') - new Date(a.date || '1970-01-01'));
    }, [cards, series, filterSeriesType, filterSubunit]);

    const availableBatchesList = useMemo(() => {
        let filtered = (batches || []).filter(b => (cards || []).some(c => String(c.batchId) === String(b.id)));
        if (filterSubunit !== 'All') {
             const validSeriesIds = new Set((series || []).filter(s => s.subunit === filterSubunit).map(s => String(s.id)));
             filtered = filtered.filter(b => validSeriesIds.has(String(b.seriesId)));
        }
        if (filterSeries.length > 0) filtered = filtered.filter(b => filterSeries.includes(String(b.seriesId)));
        return filtered.sort((a, b) => new Date(b.date || '1970-01-01') - new Date(a.date || '1970-01-01'));
    }, [cards, batches, filterSeries, filterSubunit, series]);

    // 🌟 3. 連動篩選重置邏輯 (與 CollectionTab 一致)
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

    const filteredCards = useMemo(() => {
        return (cards || []).filter(card => {
             if (viewMode === 'selected') {
                 const isSelected = localItems.some(i => String(i.cardId) === String(card.id));
                 if (!isSelected) return false;
             }

             // 🌟 修正：採用與 CollectionTab 完全相同的篩選判斷
             if (filterSubunit !== 'All' && filterMember === 'All') {
                 const mem = memberMap[String(card.memberId)];
                 const ser = seriesMap[String(card.seriesId)];
                 const belongsToSubunit = (mem && mem.subunit === filterSubunit) || (ser && ser.subunit === filterSubunit);
                 if (!belongsToSubunit) return false;
             }

             if (filterMember !== 'All' && String(card.memberId) !== String(filterMember)) return false;
             if (filterSeries.length > 0 && !filterSeries.includes(String(card.seriesId))) return false;
             
             if (filterSeriesType !== 'All' && filterSeries.length === 0) {
                const s = seriesMap[String(card.seriesId)];
                if (!s || s.type !== filterSeriesType) return false;
             }

             if (filterType !== 'All' && String(card.type) !== String(filterType)) return false;
             if (filterChannel !== 'All' && String(card.channel) !== String(filterChannel)) return false;
             if (filterBatches.length > 0 && !filterBatches.includes(String(card.batchId))) return false;
             
             return true;
        }).sort((cardA, cardB) => {
            const safeString = (val) => val ? String(val) : '';
            const safeNum = (val, defaultVal) => { const n = Number(val); return isNaN(n) ? defaultVal : n; };

            const hasBatchA = !!cardA.batchId;
            const hasBatchB = !!cardB.batchId;

            // 🌟 0. 無批次的小卡排在有批次的小卡後
            if (hasBatchA !== hasBatchB) return hasBatchA ? -1 : 1;

            // 1. 系列時間 (越舊越前)
            const sA = seriesMap[String(cardA.seriesId)];
            const sB = seriesMap[String(cardB.seriesId)];
            const dateA_series = sA?.date ? new Date(sA.date).getTime() : 253402214400000;
            const dateB_series = sB?.date ? new Date(sB.date).getTime() : 253402214400000;

            if (!hasBatchA && !hasBatchB) {
                // 🌟 無批次排序：系列時間 -> 小卡名稱 -> 成員順序
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

            // 2. 子類排序 (數字越小排越前面)
            const tA = typeMap[String(cardA.type)];
            const tB = typeMap[String(cardB.type)];
            const sortA_type = tA ? safeNum(tA.sortOrder, 999) : 999;
            const sortB_type = tB ? safeNum(tB.sortOrder, 999) : 999;
            if (sortA_type !== sortB_type) return sortA_type - sortB_type;

            // 3. 批次時間 (越舊越前)
            const bA = batchMap[String(cardA.batchId)];
            const bB = batchMap[String(cardB.batchId)];
            const dateA_batch = bA?.date ? new Date(bA.date).getTime() : 253402214400000;
            const dateB_batch = bB?.date ? new Date(bB.date).getTime() : 253402214400000;
            if (dateA_batch !== dateB_batch) return dateA_batch - dateB_batch;

            // 4. 批次名稱
            const nameA = safeString(bA?.name);
            const nameB = safeString(bB?.name);
            const nameCompare = nameA.localeCompare(nameB, 'zh-TW', { numeric: true });
            if (nameCompare !== 0) return nameCompare;

            // 5. 成員排序 (數字越小排越前面)
            const mA = memberMap[String(cardA.memberId)];
            const mB = memberMap[String(cardB.memberId)];
            const mSortA = mA ? safeNum(mA.sortOrder, 999) : 999;
            const mSortB = mB ? safeNum(mB.sortOrder, 999) : 999;
            if (mSortA !== mSortB) return mSortA - mSortB;

            return safeString(cardA.id).localeCompare(safeString(cardB.id));
        });
    }, [cards, filterMember, filterType, filterChannel, filterSeriesType, filterSeries, filterBatches, memberMap, seriesMap, batchMap, typeMap, filterSubunit, viewMode, localItems]);
    
    const RenderFilterSection = ({ label, options, current, onChange, mapName, disableToggleOff = false }) => (
        <div className="flex items-center gap-3 overflow-hidden">
           <span className="text-[10px] font-bold text-gray-400 whitespace-nowrap min-w-fit">{label}</span>
           <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 flex-1">
               {(options || []).map(opt => {
                   const id = typeof opt === 'object' ? opt.id : opt;
                   const name = mapName ? mapName(opt) : (typeof opt === 'object' ? opt.name : opt);
                   const isSelected = String(current) === String(id); // 🌟 修正：確保篩選器按鈕能正確亮起
                   return (
                       <button 
                           key={id}
                           onClick={() => {
                               if (disableToggleOff && isSelected) return; 
                               onChange(isSelected ? 'All' : id);
                           }}
                           className={`px-3 py-1 text-xs rounded-full whitespace-nowrap border select-none transition-all ${isSelected ? 'bg-indigo-600 border-indigo-600 text-white font-bold' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'}`}
                       >
                           {name}
                       </button>
                   )
               })}
           </div>
        </div>
     );

    // 🌟 點擊加入，長按移除的核心邏輯
    const hasLongPressed = useRef(false);
    const pressTimer = useRef(null);

    const handleAdd = (cardId) => {
        setLocalItems(prev => [...prev, { uid: `temp_${Date.now()}_${Math.random()}`, cardId }]);
    };

    const startPress = (cardId) => {
        hasLongPressed.current = false;
        pressTimer.current = setTimeout(() => {
            hasLongPressed.current = true;
            setLocalItems(prev => {
                let lastIdx = -1;
                for (let i = prev.length - 1; i >= 0; i--) {
                    if (String(prev[i].cardId) === String(cardId)) { lastIdx = i; break; }
                }
                if (lastIdx !== -1) {
                    const next = [...prev];
                    next.splice(lastIdx, 1); // 刪除最後一次加入的該卡片
                    return next;
                }
                return prev;
            });
        }, 500); 
    };
    const cancelPress = () => clearTimeout(pressTimer.current);

    return (
        <div className="fixed inset-0 z-[200] bg-gray-50/50 backdrop-blur-xl flex flex-col animate-slide-up">
            <div className="px-4 py-3 border-b border-gray-200/50 flex flex-col gap-3 bg-white/80 backdrop-blur-md shadow-sm z-10 sticky top-0">
                <div className="flex justify-between items-center">
                    <div className="font-bold text-lg text-gray-800">選擇卡片 <span className="text-xs font-normal text-gray-500">(點擊+1，長按-1)</span></div>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100"><X className="w-6 h-6 text-gray-500" /></button>
                </div>
                
                <div className="flex items-center justify-between gap-2">
                     <div className="flex items-center gap-2">
                         <div className="flex bg-gray-100 p-1 rounded-lg items-center h-8 flex-shrink-0">
                           <Grid className="w-3.5 h-3.5 text-gray-400 ml-1.5" />
                           <select 
                              value={cols}
                              onChange={(e) => setCols(Number(e.target.value))}
                              className="bg-transparent text-xs font-bold text-gray-600 outline-none px-1 appearance-none border-none focus:ring-0 cursor-pointer"
                           >
                              {[2,3,4,5,6,7,8,9,10].map(n => <option key={n} value={n}>{n}</option>)}
                           </select>
                        </div>

                        <button
                            onClick={() => setDetailLevel(prev => (prev + 2) % 3)}
                            className={`p-2 rounded-lg transition-all h-8 flex items-center justify-center flex-shrink-0 ${detailLevel > 0 ? 'bg-gray-200 text-gray-800' : 'bg-gray-100 text-gray-400'}`}
                            title={detailLevel === 2 ? "顯示部分資訊" : detailLevel === 1 ? "隱藏所有資訊" : "顯示完整資訊"}
                        >
                            {detailLevel === 2 && <Eye className="w-4 h-4" />}
                            {detailLevel === 1 && <Eye className="w-4 h-4 opacity-50" />}
                            {detailLevel === 0 && <EyeOff className="w-4 h-4" />}
                        </button>
                    </div>
                    
                    <div className="flex bg-gray-100 p-1 rounded-lg h-8 items-center">
                        <button onClick={() => setViewMode('all')} className={`px-3 h-full flex items-center justify-center text-xs font-bold rounded-md transition-all ${viewMode === 'all' ? 'bg-white text-black shadow-sm' : 'text-gray-400'}`}>全部</button>
                        <button onClick={() => setViewMode('selected')} className={`px-3 h-full flex items-center justify-center text-xs font-bold rounded-md transition-all ${viewMode === 'selected' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-400'}`}>已選 ({localItems.length})</button>
                    </div>
                </div>
            </div>

            <div className="bg-white p-4 border-b border-gray-100 shadow-sm space-y-4 flex-shrink-0">
                {availableSubunits.length > 0 && <RenderFilterSection label="分隊" options={availableSubunits} current={filterSubunit} onChange={(val) => { setFilterSubunit(val); setFilterMember('All'); }} mapName={s => s.name} disableToggleOff={true} />}
                {availableMembers.length > 0 && <RenderFilterSection label="成員" options={availableMembers} current={filterMember} onChange={setFilterMember} mapName={m => m.name} />}
                {availableTypes.length > 0 && <RenderFilterSection label="子類" options={availableTypes} current={filterType} onChange={setFilterType} mapName={t => t.name} />}
                {availableChannels.length > 0 && <RenderFilterSection label="通路" options={availableChannels} current={filterChannel} onChange={setFilterChannel} mapName={c => c.name} />}
                <div onClick={() => setShowSeriesModal(true)} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200 cursor-pointer hover:border-indigo-300 transition-all group">
                    <div className="flex items-center gap-2 overflow-hidden">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">系列與版本</span>
                        <div className="h-4 w-px bg-gray-300 mx-1"></div>
                        <span className={`text-xs truncate font-medium ${getSeriesSummary() !== '全部系列' ? 'text-indigo-600' : 'text-gray-600'}`}>{getSeriesSummary()}</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-indigo-500" />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar p-4">
                <div 
                    className="grid gap-2 sm:gap-3 pb-20"
                    style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
                >
                    {filteredCards.map(card => {
                        const count = localItems.filter(i => String(i.cardId) === String(card.id)).length;
                        const isSelected = count > 0;

                        const memberName = memberMap[String(card.memberId)]?.name;
                        const cardSeries = seriesMap[String(card.seriesId)];
                        const seriesName = cardSeries?.shortName || cardSeries?.name;
                        const cardBatch = batchMap[String(card.batchId)];
                        const effectiveType = card.type;
                        const typeObj = typeMap[String(effectiveType)];
                        const displayType = typeObj ? (typeObj.shortName || typeObj.name) : effectiveType;
                        const effectiveChannelId = card.channel;
                        const channelObj = channelMap[String(effectiveChannelId)];
                        const displayChannel = channelObj ? (channelObj.shortName || channelObj.name) : effectiveChannelId;
                        const batchNumber = cardBatch?.batchNumber;
                        const channelAndBatch = [displayChannel, batchNumber].filter(Boolean).join('');
                        const displayTitle = [seriesName, channelAndBatch, displayType].filter(Boolean).join(' ');

                        return (
                            <div key={card.id} 
                                className={`relative rounded-xl overflow-hidden border-2 cursor-pointer transition-all ${isSelected ? 'border-indigo-600 scale-95 shadow-md' : 'border-transparent opacity-80 hover:opacity-100'}`}
                                style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none' }}
                                onMouseDown={() => startPress(card.id)} onMouseUp={cancelPress} onMouseLeave={cancelPress}
                                onTouchStart={() => startPress(card.id)} onTouchEnd={cancelPress} onTouchMove={cancelPress}
                                onContextMenu={e => { e.preventDefault(); cancelPress(); }}
                                onClick={(e) => { 
                                    if (hasLongPressed.current) { e.preventDefault(); e.stopPropagation(); } 
                                    else { handleAdd(card.id); }
                                }}
                            >
                                <div className="aspect-[2/3] bg-gray-100 relative">
                                    {card.image ? (
                                        <Image src={card.image} alt="卡片" fill loading="lazy" quality={20} sizes="(max-width: 768px) 25vw, 15vw" className="object-cover pointer-events-none" unoptimized={true}/>
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-gray-300"><ImageIcon className="w-6 h-6" /></div>
                                    )}
                                </div>
                                {count > 0 && (
                                    <div className="absolute top-1 right-1 bg-indigo-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-bold shadow z-10">
                                        {count}
                                    </div>
                                )}
                                {detailLevel > 0 && (
                                    <div className="px-0.5 sm:px-1 bg-white pt-1 pb-1">
                                        <div className="text-[9px] sm:text-[10px] text-gray-400 uppercase font-bold mb-0.5">{memberName}</div>
                                        <div className="text-xs sm:text-sm font-bold text-gray-800 leading-tight mb-0.5 line-clamp-2">{displayTitle || '未命名卡片'}</div>
                                        {cardBatch?.name && <div className="text-[8px] sm:text-[9px] text-gray-400 mt-0.5 line-clamp-1">{cardBatch.name}</div>}
                                    </div>
                                )}
                            </div>
                        )
                    })}
                    {filteredCards.length === 0 && <div className="col-span-full py-10 text-center text-gray-400">沒有符合條件的卡片</div>}
                </div>
            </div>
            <div className="p-4 border-t border-gray-200/50 bg-white/80 backdrop-blur-md sticky bottom-0 z-10 shadow-[0_-4px_10px_rgba(0,0,0,0.05)]">
                <div className="flex gap-2">
                    <button onClick={onClose} className="flex-1 py-3 rounded-xl border font-bold text-gray-500">取消</button>
                    <button onClick={() => onConfirm(localItems)} className="flex-[2] py-3 rounded-xl bg-black text-white font-bold shadow-lg">確認加入清單 ({localItems.length} 張)</button>
                </div>
            </div>

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
                setSeries={(val) => { setFilterSeries(val); }}
                batches={availableBatchesList} selectedBatches={filterBatches} setBatches={setFilterBatches} 
            />
        </div>
    );
}

function BulkRecordDetailView({ record, onClose, onSave, onDelete, cards, members, series, batches, channels, types, uniqueTypes, uniqueChannels, uniqueSeriesTypes, uniqueSources, onRenameSource, onDeleteSource, onViewCard, inventory, subunits }) {
    const isEdit = !!record?.id;
    const isSetMode = record?.isSetMode || record?.items?.some(i => i.isSet);
    const albumOptions = useMemo(() => (series || []).filter(s => s.type === '專輯'), [series]);

    // 🌟 讀取 localStorage 記憶的專輯預設價格 (快速售出的價格) 作為購入成本預設值
    const getSavedAlbumPrice = (albumId, status) => {
        if (!albumId) return '';
        try {
            const saved = localStorage.getItem('album_prices');
            if (saved) {
                const prices = JSON.parse(saved);
                return prices[`${albumId}_${status}`] || '';
            }
        } catch (e) { console.error(e); }
        return '';
    };

    // 🌟 核心修復：在元件一掛載時，就固定這個紀錄的 ID，避免每次編輯都因為尚未有 ID 而產生全新的一筆
    const [localRecordId] = useState(() => record?.id || Date.now().toString());

    const [form, setForm] = useState({
        name: record?.name || '', image: record?.image || null, status: record?.status || '未發貨',
        buyDate: record?.buyDate || new Date().toISOString().split('T')[0], source: record?.source || '',
    });

    const [totalAmount, setTotalAmount] = useState(record?.totalAmount || '');
    
    // 🌟 排序小卡的輔助函式：依照成員 sortOrder 由小到大排序
    const sortItemsByMember = (items) => {
        return [...items].sort((a, b) => {
            const cardA = (cards || []).find(c => String(c.id) === String(a.cardId));
            const cardB = (cards || []).find(c => String(c.id) === String(b.cardId));
            const memA = cardA ? (members || []).find(m => String(m.id) === String(cardA.memberId)) : null;
            const memB = cardB ? (members || []).find(m => String(m.id) === String(cardB.memberId)) : null;
            const orderA = memA && memA.sortOrder !== undefined && memA.sortOrder !== null ? Number(memA.sortOrder) : 999;
            const orderB = memB && memB.sortOrder !== undefined && memB.sortOrder !== null ? Number(memB.sortOrder) : 999;
            if (orderA !== orderB) return orderA - orderB;
            return String(a.cardId).localeCompare(String(b.cardId)); // 若同成員則以卡片ID穩定排序
        });
    };

    // 🌟 將舊有的歸戶物件，攤平成純陣列，每張卡都是獨立的物件 (包含 uid, buyPrice, sellPrice)
    const [cardItems, setCardItems] = useState(() => {
        const items = (record?.items || []).filter(i => !i.isMisc && !i.isAlbum);
        
        // 🌟 核心修復：直接使用 bulk_records.items 內的 ID 作為唯一識別碼 (uid)，
        // 避免重新整理後因匹配邏輯錯誤 (用 cardId 找) 導致重複卡片關聯丟失。
        const initialItems = items.map(item => {
            const matchedInv = (inventory || []).find(inv => String(inv.id) === String(item.id));
            
            return {
                uid: item.id || `temp_${Date.now()}_${Math.random()}`, // item.id 就是 inventory ID，是唯一且穩定的
                cardId: item.cardId,
                buyPrice: item.buyPrice,
                sellPrice: matchedInv?.sellPrice || item.sellPrice || '',
                sellDate: matchedInv?.sellDate || item.sellDate || '',
                isManual: item.isManual,
                isSet: isSetMode || item.isSet || false,
            };
        });
        
        return sortItemsByMember(initialItems);
    });
    
    // 🌟 新增：獨立的專輯列表狀態
    const [albumItems, setAlbumItems] = useState(() => {
        return (record?.items || []).filter(i => i.isAlbum).map(i => ({
            ...i,
            uid: i.uid || i.id || `album_${Date.now()}_${Math.random()}`,
            sellDate: i.sellDate || ''
        }));
    });

    const [miscItems, setMiscItems] = useState((record?.items || []).filter(i => i.isMisc).map(i => ({ ...i, id: i.id || Date.now().toString() + Math.random() })));
    const [showCardSelector, setShowCardSelector] = useState(false);
    const [cardToRemove, setCardToRemove] = useState(null);
    const [miscToRemove, setMiscToRemove] = useState(null);
    const [albumToRemove, setAlbumToRemove] = useState(null); // 🌟 新增刪除專輯確認
    const [albumToSelect, setAlbumToSelect] = useState(null);
    const swipeHandlers = useSwipeToClose(onClose);

    const totalSoldPrice = useMemo(() => {
        const cardSellSum = cardItems.reduce((acc, item) => acc + (Number(item.sellPrice) || 0), 0);
        const miscSellSum = miscItems.reduce((acc, item) => acc + (Number(item.sellPrice) || 0), 0);
        const albumSellSum = albumItems.reduce((acc, item) => acc + (Number(item.sellPrice) || 0), 0); // 🌟 加入專輯售價
        return cardSellSum + miscSellSum + albumSellSum;
    }, [cardItems, miscItems, albumItems]);

    // 🌟 監聽外部 inventory 的變化，實時同步到盤收記錄內的小卡與專輯清單
    // 確保在卡片詳情中編輯的售出價格等，能立即反應到此畫面
    useEffect(() => {
        if (!record?.id) return;
        
        setCardItems(prev => {
            let hasChange = false;
            // 取得此盤收專屬的所有小卡庫存
            const availableInv = [...inventory.filter(i => String(i.bulkRecordId) === String(record.id) && !i.albumId)];
            
            const next = prev.map(item => {
                let invIdx = availableInv.findIndex(i => String(i.id) === String(item.uid));
                
                // 🌟 核心修復：如果是剛加入的卡片 (uid 為 temp_ 或 sel_)，改用 cardId 來尋找對應的真實庫存紀錄
                if (invIdx === -1 && (String(item.uid).startsWith('temp_') || String(item.uid).startsWith('sel_'))) {
                    invIdx = availableInv.findIndex(i => String(i.cardId) === String(item.cardId));
                }
                
                let inv = null;
                if (invIdx !== -1) {
                    inv = availableInv[invIdx];
                    availableInv.splice(invIdx, 1); // 消耗掉，確保重複的同款卡片能對應到不同的庫存
                }

                if (inv) {
                    const newUid = inv.id; // 🌟 升級為真實 ID，確保未來的配對永不脫鉤
                    const newSellPrice = inv.sellPrice ? inv.sellPrice : '';
                    const newBuyPrice = inv.buyPrice !== undefined ? inv.buyPrice : item.buyPrice;
                    const newSellDate = inv.sellDate || '';
                    
                    if (String(newSellPrice) !== String(item.sellPrice) || newSellDate !== item.sellDate || String(newBuyPrice) !== String(item.buyPrice) || item.uid !== newUid) {
                        hasChange = true;
                        return { ...item, uid: newUid, sellPrice: newSellPrice, sellDate: newSellDate, buyPrice: newBuyPrice };
                    }
                }
                return item;
            });
            return hasChange ? next : prev;
        });

        setAlbumItems(prev => {
            let hasChange = false;
            const availableInv = [...inventory.filter(i => String(i.bulkRecordId) === String(record.id) && i.albumId)];
            
            const next = prev.map(item => {
                let invIdx = availableInv.findIndex(i => String(i.id) === String(item.uid));
                
                if (invIdx === -1 && String(item.uid).startsWith('album_')) {
                    invIdx = availableInv.findIndex(i => String(i.albumId) === String(item.albumId) && i.albumStatus === item.albumStatus);
                }
                
                let inv = null;
                if (invIdx !== -1) {
                    inv = availableInv[invIdx];
                    availableInv.splice(invIdx, 1);
                }

                if (inv) {
                    const newUid = inv.id;
                    const newSellPrice = inv.sellPrice ? inv.sellPrice : '';
                    const newBuyPrice = inv.buyPrice !== undefined ? inv.buyPrice : item.buyPrice;
                    const newSellDate = inv.sellDate || '';
                    
                    if (String(newSellPrice) !== String(item.sellPrice) || newSellDate !== item.sellDate || String(newBuyPrice) !== String(item.buyPrice) || item.uid !== newUid) {
                        hasChange = true;
                        return { ...item, uid: newUid, sellPrice: newSellPrice, sellDate: newSellDate, buyPrice: newBuyPrice };
                    }
                }
                return item;
            });
            return hasChange ? next : prev;
        });
    }, [inventory, record?.id]);

    // 🌟 新增：如果是新建狀態且有預設名稱 (例如套收)，則在一載入時就觸發一次儲存
    // 確保資料不會因為使用者只看一眼就關閉視窗而遺失
    useEffect(() => {
        if (!isEdit && form.name.trim()) {
            syncToParent(form, totalAmount, cardItems, miscItems, albumItems);
        }
    }, []);

    // 🌟 加入防抖機制，避免打字時瘋狂觸發 DB 儲存
    const syncTimer = useRef(null);

    useEffect(() => {
        return () => {
            if (syncTimer.current) clearTimeout(syncTimer.current);
        };
    }, []);

    const syncToParent = (updatedForm, updatedTotal, updatedCardItems, updatedMiscItems, updatedAlbumItems, forceSave = false) => {
        if (!updatedForm.name.trim() && !isSetMode) return;
        
        if (syncTimer.current) clearTimeout(syncTimer.current);
        
        const executeSave = () => {
            const finalCardItems = updatedCardItems.map(item => ({
                id: item.uid, // 回傳 inventory ID 給 App
                cardId: item.cardId, quantity: 1, buyPrice: Number(item.buyPrice) || 0, sellPrice: Number(item.sellPrice) || 0, sellDate: item.sellDate,
                isManual: item.isManual, isMisc: false, isSet: isSetMode || item.isSet || false
            }));

            const finalMiscItems = updatedMiscItems.map(m => ({
                id: m.id, name: m.name, quantity: 1, buyPrice: Number(m.buyPrice) || 0, sellPrice: Number(m.sellPrice) || 0,
                sellDate: m.sellDate, isMisc: true, isManual: true
            }));

            const finalAlbumItems = updatedAlbumItems.map(a => ({
                id: a.id || a.uid,
                albumId: a.albumId,
                albumStatus: a.albumStatus || '未拆',
                albumQuantity: Number(a.albumQuantity) || 0,
                buyPrice: Number(a.buyPrice) || 0,
                sellPrice: Number(a.sellPrice) || 0,
                sellDate: a.sellDate,
                isAlbum: true,
            isManual: a.isManual !== undefined ? a.isManual : true
            }));

            onSave({ ...updatedForm, id: localRecordId, totalAmount: Number(updatedTotal) || 0, items: [...finalCardItems, ...finalMiscItems, ...finalAlbumItems] });
        };

        if (forceSave) {
            executeSave();
        } else {
            syncTimer.current = setTimeout(executeSave, 600);
        }
    };

    // 🌟 新版均價計算 (加入專輯成本扣除)
    // 🌟 新版均價計算 (加入專輯成本扣除，雜物也參與均分)
    const recalculatePrices = (totalVal, currentCardItems, currentMiscItems, currentAlbumItems) => {
        if (totalVal === '' || totalVal === undefined) {
            return {
                nextCards: currentCardItems.map(c => c.isManual ? c : { ...c, buyPrice: '' }),
                nextMisc: currentMiscItems.map(m => m.isManual ? m : { ...m, buyPrice: '' }),
                nextAlbums: currentAlbumItems.map(a => a.isManual ? a : { ...a, buyPrice: '' })
            };
        }
        const total = Number(totalVal) || 0;
        let manualSum = 0; 
        let autoQty = 0;
        
        // Cards
        currentCardItems.forEach(c => {
            if (c.isManual) manualSum += Number(c.buyPrice) || 0;
            else autoQty += 1;
        });

        // Misc (雜物也參與均分邏輯)
        currentMiscItems.forEach(m => {
             if (m.isManual) manualSum += Number(m.buyPrice) || 0;
             else autoQty += 1;
        });
        
        // Albums
        currentAlbumItems.forEach(a => { 
            if (a.isManual) {
                manualSum += (Number(a.buyPrice) || 0) * (Number(a.albumQuantity) || 0); 
            } else {
                autoQty += (Number(a.albumQuantity) || 0);
            }
        });
        
        const remaining = Math.max(0, total - manualSum);
        const autoPrice = autoQty > 0 ? Math.round(remaining / autoQty) : 0;
        
        const nextCards = currentCardItems.map(c => {
            if (!c.isManual) return { ...c, buyPrice: autoPrice };
            return c;
        });

        const nextMisc = currentMiscItems.map(m => {
            if (!m.isManual) return { ...m, buyPrice: autoPrice };
            return m;
        });

        const nextAlbums = currentAlbumItems.map(a => {
            if (!a.isManual) return { ...a, buyPrice: autoPrice };
            return a;
        });

        return { nextCards, nextMisc, nextAlbums };
    };

    const handleFormChange = (key, value) => {
        const nextForm = { ...form, [key]: value };
        setForm(nextForm); syncToParent(nextForm, totalAmount, cardItems, miscItems, albumItems);
    };

    const handleTotalAmountChange = (e) => {
        const val = e.target.value; setTotalAmount(val);
        const { nextCards, nextMisc, nextAlbums } = recalculatePrices(val, cardItems, miscItems, albumItems);
        setCardItems(nextCards); 
        setMiscItems(nextMisc);
        setAlbumItems(nextAlbums);
        syncToParent(form, val, nextCards, nextMisc, nextAlbums);
    };

    const handleCardChange = (uid, field, value) => {
        let nextItems = cardItems.map(c => {
            if (c.uid === uid) {
                const updated = { ...c, [field]: value };
                if (field === 'buyPrice') updated.isManual = (value !== '' && Number(value) !== 0);
                return updated;
            }
            return c;
        });
        if (field === 'buyPrice') {
            const { nextCards, nextMisc, nextAlbums } = recalculatePrices(totalAmount, nextItems, miscItems, albumItems);
            setCardItems(nextCards);
            setMiscItems(nextMisc);
            setAlbumItems(nextAlbums);
            syncToParent(form, totalAmount, nextCards, nextMisc, nextAlbums);
        } else {
            setCardItems(nextItems);
            syncToParent(form, totalAmount, nextItems, miscItems, albumItems);
        }
    };

    const handleAddMisc = () => {
        const newMisc = [...miscItems, { id: Date.now().toString(), name: '', buyPrice: '', sellPrice: '', sellDate: new Date().toISOString().split('T')[0] }];
        setMiscItems(newMisc); syncToParent(form, totalAmount, cardItems, newMisc, albumItems);
    };

    const handleMiscChange = (id, field, value) => {
        let nextMisc = miscItems.map(m => {
            if (m.id === id) {
                const updated = { ...m, [field]: value };
                if (field === 'buyPrice') updated.isManual = (value !== '' && Number(value) !== 0);
                return updated;
            }
            return m;
        });
        
        if (field === 'buyPrice') {
            const { nextCards, nextMisc: recalculatedMisc, nextAlbums } = recalculatePrices(totalAmount, cardItems, nextMisc, albumItems);
            setCardItems(nextCards);
            setMiscItems(recalculatedMisc);
            setAlbumItems(nextAlbums);
            syncToParent(form, totalAmount, nextCards, recalculatedMisc, nextAlbums);
        } else {
            setMiscItems(nextMisc);
            syncToParent(form, totalAmount, cardItems, nextMisc, albumItems);
        }
    };

    // 🌟 專輯操作函式
    const handleAddAlbum = () => {
        let defaultAlbumId = '';
        // 如果是套收且有卡片，試著從卡片的系列中找出對應的專輯
        if (isSetMode && cardItems.length > 0) {
            const firstCardId = cardItems[0].cardId;
            const card = (cards || []).find(c => String(c.id) === String(firstCardId));
            if (card && card.seriesId) {
                const s = (series || []).find(ser => String(ser.id) === String(card.seriesId));
                if (s && s.type === '專輯') {
                    defaultAlbumId = s.id;
                }
            }
        }

        const defaultPrice = getSavedAlbumPrice(defaultAlbumId, '未拆');

        const newAlbum = { 
            uid: `album_${Date.now()}_${Math.random()}`, 
            albumId: defaultAlbumId, 
            albumStatus: '未拆', 
            albumQuantity: 1, 
            buyPrice: defaultPrice, 
            sellPrice: '', 
            sellDate: new Date().toISOString().split('T')[0],
            isAlbum: true,
            isManual: !!defaultPrice
        };
        const nextAlbums = [...albumItems, newAlbum];
        setAlbumItems(nextAlbums);
        
        if (defaultPrice) {
            const { nextCards, nextMisc, nextAlbums: recalculatedAlbums } = recalculatePrices(totalAmount, cardItems, miscItems, nextAlbums);
            setCardItems(nextCards);
            setMiscItems(nextMisc);
            setAlbumItems(recalculatedAlbums);
            syncToParent(form, totalAmount, nextCards, nextMisc, recalculatedAlbums);
        } else {
            syncToParent(form, totalAmount, cardItems, miscItems, nextAlbums);
        }
    };

    const handleAlbumChange = (uid, field, value) => {
        let nextAlbums = albumItems.map(a => {
            if (a.uid === uid) {
                const updated = { ...a, [field]: value };
                // 🌟 當更換專輯或切換狀態時，自動讀取該狀態的記憶售價
                if (field === 'albumId' || field === 'albumStatus') {
                    const defaultPrice = getSavedAlbumPrice(updated.albumId, updated.albumStatus);
                    if (defaultPrice) {
                        updated.buyPrice = defaultPrice;
                        updated.isManual = true;
                    }
                } else if (field === 'buyPrice') {
                    updated.isManual = (value !== '' && Number(value) !== 0);
                }
                return updated;
            }
            return a;
        });
        setAlbumItems(nextAlbums);
        // 🌟 專輯數量或單價變更時，重新計算總金額分配
        if (field === 'buyPrice' || field === 'albumQuantity' || field === 'albumId' || field === 'albumStatus') {
            const { nextCards, nextMisc, nextAlbums: recalculatedAlbums } = recalculatePrices(totalAmount, cardItems, miscItems, nextAlbums);
            setCardItems(nextCards);
            setMiscItems(nextMisc);
            setAlbumItems(recalculatedAlbums);
            syncToParent(form, totalAmount, nextCards, nextMisc, recalculatedAlbums);
        } else {
            syncToParent(form, totalAmount, cardItems, miscItems, nextAlbums);
        }
    };

    // 🌟 快速售出專輯
    const handleQuickSellAlbum = async (uid) => {
        const target = albumItems.find(a => a.uid === uid);
        if (!target || target.albumQuantity <= 0) return alert("庫存不足");
        
        const priceStr = prompt(`售出一張「${(series||[]).find(s=>s.id===target.albumId)?.name}」\n請輸入售出價格:`, "0");
        if (priceStr === null) return;
        const price = Number(priceStr) || 0;

        // 1. Create Sale Record
        const saleData = {
            id: Date.now().toString(),
            cardId: target.albumId, 
            price: price,
            quantity: 1,
            date: new Date().toISOString().split('T')[0],
            note: `盤收快速售出: ${(series||[]).find(s=>s.id===target.albumId)?.name}`,
            color: 'bg-purple-500'
        };
        
        await supabase.from('ui_sales').insert(toSnakeCase(saleData));
        setSales(prev => [...prev, saleData]);

        // 2. Update Local State
        const nextAlbums = albumItems.map(a => {
            if (a.uid === uid) {
                return { 
                    ...a, 
                    albumQuantity: Math.max(0, a.albumQuantity - 1),
                    soldCount: (a.soldCount || 0) + 1,
                    latestSellDate: new Date().toISOString().split('T')[0]
                };
            }
            return a;
        });
        setAlbumItems(nextAlbums);
        
        // Recalculate costs
        const { nextCards, nextMisc, nextAlbums: recalculatedAlbums } = recalculatePrices(totalAmount, cardItems, miscItems, nextAlbums);
        setCardItems(nextCards);
        setMiscItems(nextMisc);
        setAlbumItems(recalculatedAlbums);
        
        syncToParent(form, totalAmount, nextCards, nextMisc, recalculatedAlbums);
    };

    const handleConfirmSelectCards = (newSelectedItems) => {
        const nextCardItems = newSelectedItems.map(newItem => {
            const existing = cardItems.find(c => c.uid === newItem.uid);
            if (existing) return existing;
            return { uid: newItem.uid, cardId: newItem.cardId, buyPrice: '', sellPrice: '', sellDate: '', isManual: false, isSet: isSetMode };
        });
        const sortedNextCardItems = sortItemsByMember(nextCardItems);
        const { nextCards, nextMisc, nextAlbums } = recalculatePrices(totalAmount, sortedNextCardItems, miscItems, albumItems);
        setCardItems(nextCards); 
        setMiscItems(nextMisc);
        setAlbumItems(nextAlbums);
        syncToParent(form, totalAmount, nextCards, nextMisc, nextAlbums, true);
        setShowCardSelector(false);
    };

    const pressTimer = useRef(null);
    const hasCardLongPressed = useRef(false);
    const startPress = (uid, title) => {
        hasCardLongPressed.current = false;
        pressTimer.current = setTimeout(() => { hasCardLongPressed.current = true; setCardToRemove({ uid, title }); }, 500);
    };
    const cancelPress = () => clearTimeout(pressTimer.current);

    const miscPressTimer = useRef(null);
    const hasMiscLongPressed = useRef(false);
    const startMiscPress = (miscId, name) => {
        hasMiscLongPressed.current = false;
        miscPressTimer.current = setTimeout(() => { hasMiscLongPressed.current = true; setMiscToRemove({ id: miscId, name: name || '未命名雜物' }); }, 500);
    };
    const cancelMiscPress = () => clearTimeout(miscPressTimer.current);

    const handleClose = () => {
        if (form.name.trim() || isSetMode) {
            syncToParent(form, totalAmount, cardItems, miscItems, albumItems, true);
        }
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[150] bg-gray-50/50 backdrop-blur-xl flex flex-col animate-slide-up" {...swipeHandlers}>
            <div className="px-4 py-3 border-b border-gray-200/50 flex items-center justify-between bg-white/80 backdrop-blur-md z-10 sticky top-0 shadow-sm">
                <button onClick={handleClose} className="p-2 -ml-2 rounded-full hover:bg-gray-100 transition-colors"><ArrowLeft className="w-6 h-6 text-gray-700" /></button>
                <div className="font-bold text-lg">{isEdit ? (isSetMode ? '編輯套收記錄' : '編輯盤收記錄') : (isSetMode ? '新增套收記錄' : '新增盤收記錄')}</div>
                <div className="flex gap-1 items-center">
                    {isEdit && <button onClick={() => { if(confirm('確定要刪除這筆記錄嗎？')) onDelete(record.id); }} className="p-2 text-gray-400 hover:text-red-500 rounded-full transition-colors"><Trash2 className="w-5 h-5" /></button>}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar p-2 sm:p-4 space-y-4 pb-24">
                <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex gap-4">
                    <div className="w-28 h-28 flex-shrink-0">
                        <ImageUploader image={form.image} aspect={1} onChange={img => handleFormChange('image', img)} className="w-full h-full rounded-xl" />
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col justify-between">
                        <input type="text" placeholder={isSetMode ? "輸入套收名稱" : "輸入盤收名稱"} value={form.name} onChange={e => handleFormChange('name', e.target.value)} className="w-full text-lg font-black text-gray-800 bg-transparent border-b border-gray-200 focus:border-indigo-500 outline-none pb-1 placeholder-gray-300" />
                        <div className="grid grid-cols-2 gap-2 mt-2">
                             <div className="relative">
                                <select value={form.status} onChange={e => handleFormChange('status', e.target.value)} className="w-full bg-gray-50 border border-gray-200 p-2 rounded-lg outline-none text-xs font-bold text-gray-700 appearance-none focus:ring-1 focus:ring-indigo-200">
                                    <option value="未發貨">未發貨</option><option value="囤貨">囤貨</option><option value="到貨">到貨</option>
                                </select>
                                <ChevronDown className="w-3 h-3 text-gray-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                            </div>
                            <input type="date" value={form.buyDate} onChange={e => handleFormChange('buyDate', e.target.value)} className="w-full bg-gray-50 border border-gray-200 p-2 rounded-lg outline-none text-xs font-bold text-gray-700 focus:ring-1 focus:ring-indigo-200" />
                        </div>
                        <div className="mt-3">
                            <FormCapsuleSelect label="來源" options={uniqueSources || []} value={form.source} onChange={val => handleFormChange('source', val)} allowCustom={true} placeholder="自訂來源..." onOptionEdit={onRenameSource} onDelete={onDeleteSource} onOptionDelete={onDeleteSource} />
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div className="bg-green-50/50 p-4 rounded-2xl flex flex-col justify-between border border-green-100/50 relative shadow-sm min-h-[100px]">
                        <label className="text-xs font-bold text-green-600 uppercase tracking-widest flex items-center gap-2">總售價</label>
                        <div className="flex items-baseline mt-2">
                            <span className="text-xl text-green-600 font-bold mr-1">$</span>
                            <span className="text-3xl sm:text-4xl font-black text-green-600 truncate">{totalSoldPrice.toLocaleString()}</span>
                        </div>
                    </div>
                    <div className="bg-red-50/50 p-4 rounded-2xl flex flex-col justify-between border border-red-100/50 hover:border-red-200 transition-colors relative shadow-sm min-h-[100px]">
                        <div className="flex justify-between items-start">
                            <label className="text-[10px] sm:text-xs font-bold text-red-600 uppercase tracking-widest">批量總金額</label>
                            {cardItems.filter(c=>c.isManual).length > 0 && <span className="text-[10px] bg-red-500 text-white px-1.5 py-0.5 rounded font-bold shadow-sm whitespace-nowrap">{cardItems.filter(c=>c.isManual).length} 自訂</span>}
                        </div>
                        <div className="flex items-baseline mt-2">
                            <span className="text-xl text-red-600 font-bold mr-1">$</span>
                            <input type="number" placeholder="0" step="50" min="0" value={totalAmount} onChange={handleTotalAmountChange} className="w-full bg-transparent text-3xl sm:text-4xl font-black text-red-600 outline-none placeholder-red-200" />
                        </div>
                    </div>
                </div>

                <div>
                    <div className="flex justify-between items-end mb-3 px-1">
                        <div className="font-bold text-gray-800 text-sm">小卡清單 <span className="text-gray-400 text-xs ml-1">({cardItems.length} 張)</span></div>
                        <button onClick={() => setShowCardSelector(true)} className="text-xs bg-indigo-50 text-indigo-700 hover:bg-indigo-100 px-3 py-1.5 rounded-full flex items-center gap-1 font-bold transition-colors"><Plus className="w-3 h-3"/> 新增卡片</button>
                    </div>
                    
                    <div className="space-y-3 max-h-[40vh] overflow-y-auto no-scrollbar px-1 pb-4">
                        {cardItems.map((item, idx) => {
                            const card = (cards || []).find(c => String(c.id) === String(item.cardId));
                            if (!card) return null;
                            const cardSeries = (series || []).find(s => String(s.id) === String(card.seriesId));
                            const cardBatch = (batches || []).find(b => String(b.id) === String(card.batchId));
                            const typeObj = (types || []).find(t => String(t.id) === String(card.type) || t.name === card.type);
                            const channelObj = (channels || []).find(c => String(c.id) === String(card.channel) || c.name === card.channel);
                            const displayTitle = [cardSeries?.shortName || cardSeries?.name, [(channelObj?.shortName || channelObj?.name), cardBatch?.batchNumber].filter(Boolean).join(''), typeObj?.shortName || typeObj?.name].filter(Boolean).join(' ');

                            return (
                                <div key={item.uid} className={`flex items-center gap-4 bg-white p-2 border-b last:border-b-0 transition-colors ${item.isManual ? 'bg-indigo-50/30' : ''}`}>
                                    <div 
                                        className="flex items-center gap-4 flex-1 min-w-0 cursor-pointer select-none"
                                        style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none' }}
                                        onMouseDown={() => startPress(item.uid, displayTitle)} onMouseUp={cancelPress} onMouseLeave={cancelPress}
                                        onTouchStart={() => startPress(item.uid, displayTitle)} onTouchEnd={cancelPress} onTouchMove={cancelPress}
                                        onContextMenu={(e) => { e.preventDefault(); cancelPress(); setCardToRemove({ uid: item.uid, title: displayTitle }); }}
                                        onClick={(e) => { 
                                            if (hasCardLongPressed.current) { 
                                                e.preventDefault(); 
                                                e.stopPropagation(); 
                                            } else {
                                                if (card && onViewCard) onViewCard(card);
                                            }
                                        }}
                                    >
                                        <div className="w-12 aspect-[2/3] flex-shrink-0 bg-gray-100 rounded overflow-hidden border relative">
                                            {card.image ? (
                                                <Image src={card.image} alt="卡片圖片" fill className="object-cover pointer-events-none" sizes="15vw" unoptimized={true} />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-gray-300"><ImageIcon className="w-4 h-4" /></div>
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-xs font-bold text-gray-800 truncate">{displayTitle || '未命名卡片'}</div>
                                            {cardBatch?.name && <div className="text-[10px] text-gray-500 truncate">{cardBatch.name}</div>}
                                            {/* 🌟 售出日期移到名稱下方 */}
                                            {Number(item.sellPrice) > 0 && (
                                                <div 
                                                    className="flex items-center gap-1 mt-1 bg-green-50 px-2 py-1 rounded-lg w-fit active:scale-95 transition-transform"
                                                    onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}
                                                >
                                                   <Calendar className="w-3.5 h-3.5 text-green-600" />
                                                   <input 
                                                       type="date" 
                                                       value={item.sellDate || ''} 
                                                       onChange={e => handleCardChange(item.uid, 'sellDate', e.target.value)} 
                                                       className="bg-transparent text-xs font-bold text-green-600 outline-none w-24 p-0 cursor-pointer" 
                                                   />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    
                                    <div className="flex items-center gap-3 sm:gap-4 flex-shrink-0 w-auto justify-end">
                                        <div className="flex flex-col items-end">
                                            <label className="text-[9px] text-green-500 font-bold uppercase mb-0.5">售出</label>
                                            <div className="flex items-baseline">
                                                <span className="text-[10px] font-bold text-green-500 mr-0.5">$</span>
                                                <input 
                                                    type="number" placeholder="0" step="50" min="0"
                                                    value={item.sellPrice} 
                                                    onChange={e => handleCardChange(item.uid, 'sellPrice', e.target.value)} 
                                                    className="w-12 sm:w-14 text-right border-b border-gray-200 focus:border-green-400 outline-none font-bold text-base py-0.5 bg-transparent text-green-600 placeholder-green-200 transition-colors" 
                                                />
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end">
                                            <label className="text-[9px] font-bold uppercase mb-0.5 flex items-center gap-1">
                                                {item.isManual ? <span className="text-indigo-500">自訂購入</span> : <span className="text-red-400">購入</span>}
                                            </label>
                                            <div className="flex items-baseline">
                                                <span className={`text-[10px] font-bold mr-0.5 ${item.isManual ? 'text-indigo-500' : 'text-red-500'}`}>$</span>
                                                <input 
                                                    type="number" placeholder="0" step="50" min="0"
                                                    value={item.buyPrice} 
                                                    onChange={e => handleCardChange(item.uid, 'buyPrice', e.target.value)} 
                                                    className={`w-12 sm:w-14 text-right border-b border-gray-200 outline-none font-bold text-base py-0.5 bg-transparent transition-colors ${item.isManual ? 'text-indigo-600 placeholder-indigo-200 focus:border-indigo-400' : 'text-red-600 placeholder-red-200 focus:border-red-400'}`} 
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                        {cardItems.length === 0 && <div className="text-center py-12 text-gray-400 border-2 border-dashed border-gray-200 rounded-xl bg-white">點擊右上角「+ 新增卡片」加入這筆盤收的內容</div>}
                    </div>

                    {/* 🌟 專輯內容區塊 (移到下方) */}
                    <div className="mt-4 border-t-2 border-dashed border-gray-200 pt-4">
                        <div className="flex justify-between items-end mb-3 px-1">
                            <div className="font-bold text-gray-800 text-sm flex items-center gap-1">
                                <Disc className="w-4 h-4 text-purple-500"/>
                                專輯記錄
                            </div>  
                            <button onClick={handleAddAlbum} className="text-xs bg-purple-50 text-purple-600 hover:bg-purple-100 px-3 py-1.5 rounded-full flex items-center gap-1 font-bold transition-colors">
                                <Plus className="w-3 h-3"/> 新增專輯
                            </button>
                        </div>
                        
                        <div className="space-y-3 px-1 pb-4">
                            {albumItems.map((item) => {
                                const album = (series || []).find(s => s.id === item.albumId);
                                return (
                                    <div key={item.uid} className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4 bg-white p-3 rounded-xl border border-gray-200 shadow-sm transition-colors relative">
                                        <div 
                                            className="flex items-center gap-3 flex-1 min-w-0 w-full sm:w-auto cursor-pointer select-none"
                                            onClick={() => setAlbumToSelect(item.uid)}
                                        >
                                            <div className="w-12 h-12 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0 border relative group">
                                                {album?.image ? <Image src={album.image} alt={album.name} fill className="object-cover" unoptimized={true} /> : <Disc className="w-6 h-6 text-gray-300 m-auto" />}
                                                <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <PenTool className="w-5 h-5 text-white" />
                                                </div>
                                            </div>
                                            <div className="flex-1 min-w-0 flex flex-col justify-center items-start">
                                                <p className="text-sm font-bold text-gray-800 truncate">{album?.name || '選擇專輯...'}</p>
                                                {Number(item.sellPrice) > 0 && (
                                                    <div 
                                                        className="flex items-center gap-1 mt-1 bg-green-50 px-2 py-1 rounded-lg w-fit active:scale-95 transition-transform"
                                                        onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}
                                                    >
                                                       <Calendar className="w-3.5 h-3.5 text-green-600" />
                                                       <input 
                                                           type="date" 
                                                           value={item.sellDate || ''} 
                                                           onChange={e => handleAlbumChange(item.uid, 'sellDate', e.target.value)} 
                                                           className="bg-transparent text-xs font-bold text-green-600 outline-none w-24 p-0 cursor-pointer" 
                                                       />
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3 sm:gap-4 flex-shrink-0 w-full sm:w-auto justify-end border-t sm:border-t-0 pt-2 sm:pt-0 mt-1 sm:mt-0">
                                            <button 
                                                type="button"
                                                onClick={() => handleAlbumChange(item.uid, 'albumStatus', item.albumStatus === '未拆' ? '空專' : '未拆')}
                                                className={`px-2 py-1.5 rounded-lg border text-xs font-bold whitespace-nowrap ${item.albumStatus === '未拆' ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-gray-100 text-gray-500 border-gray-200'}`}
                                            >
                                                {item.albumStatus}
                                            </button>
                                            <div className="flex flex-col items-end">
                                                <label className="text-[9px] text-green-500 font-bold uppercase mb-0.5">售出</label>
                                                <div className="flex items-baseline">
                                                    <span className="text-[10px] font-bold text-green-500 mr-0.5">$</span>
                                                    <input 
                                                        type="number" placeholder="0" step="50" min="0"
                                                        value={item.sellPrice} 
                                                        onChange={e => handleAlbumChange(item.uid, 'sellPrice', e.target.value)} 
                                                        className="w-12 sm:w-14 text-right border-b border-gray-200 focus:border-green-400 outline-none font-bold text-base py-0.5 bg-transparent text-green-600 placeholder-green-200 transition-colors" 
                                                    />
                                                </div>
                                            </div>
                                            <div className="flex flex-col items-end">
                                                <label className="text-[9px] font-bold uppercase mb-0.5 text-red-400">購入</label>
                                                <div className="flex items-baseline">
                                                    <span className="text-[10px] font-bold text-red-500 mr-0.5">$</span>
                                                    <input 
                                                        type="number" placeholder="0" step="50" min="0"
                                                        value={item.buyPrice} 
                                                        onChange={e => handleAlbumChange(item.uid, 'buyPrice', e.target.value)} 
                                                        className="w-12 sm:w-14 text-right border-b border-gray-200 outline-none font-bold text-base py-0.5 bg-transparent text-red-600 placeholder-red-200 focus:border-red-400" 
                                                    />
                                                </div>
                                            </div>
                                            <button onClick={() => setAlbumToRemove(item)} className="p-1.5 text-gray-300 hover:text-red-500 rounded-full transition-colors"><Trash2 className="w-4 h-4" /></button>
                                            </div>
                                        </div>
                                )
                            })}
                            {albumItems.length === 0 && <div className="text-center py-6 text-gray-400 border-2 border-dashed border-gray-200 rounded-xl bg-white text-xs">此{isSetMode ? '套' : '盤'}收未包含專輯。</div>}
                        </div>
                    </div>

                    <div className="mt-4 border-t-2 border-dashed border-gray-200 pt-4">
                        <div className="flex justify-between items-end mb-3 px-1">
                            <div className="font-bold text-gray-800 text-sm flex items-center gap-1">
                                <Tag className="w-4 h-4 text-orange-500"/>
                                雜物記錄 
                            </div>
                            <button onClick={handleAddMisc} className="text-xs bg-orange-50 text-orange-600 hover:bg-orange-100 px-3 py-1.5 rounded-full flex items-center gap-1 font-bold transition-colors">
                                <Plus className="w-3 h-3"/> 新增雜物
                            </button>
                        </div>
                        
                        <div className="space-y-3 px-1 pb-4">
                            {miscItems.map((misc, idx) => (
                                <div key={misc.id} className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4 bg-white p-3 rounded-xl border border-gray-200 shadow-sm transition-colors relative">
                                    <div 
                                        className="flex items-center gap-3 flex-1 min-w-0 w-full sm:w-auto cursor-pointer select-none"
                                        style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none' }}
                                        onMouseDown={() => startMiscPress(misc.id, misc.name)} onMouseUp={cancelMiscPress} onMouseLeave={cancelMiscPress}
                                        onTouchStart={() => startMiscPress(misc.id, misc.name)} onTouchEnd={cancelMiscPress} onTouchMove={cancelMiscPress}
                                        onContextMenu={(e) => { e.preventDefault(); cancelMiscPress(); setMiscToRemove({ id: misc.id, name: misc.name || '未命名雜物' }); }}
                                        onClick={(e) => { if (hasMiscLongPressed.current) { e.preventDefault(); e.stopPropagation(); } }}
                                    >
                                        <div className="w-10 h-10 sm:w-12 sm:h-12 aspect-square flex-shrink-0 bg-orange-50 rounded-lg border border-orange-100 flex items-center justify-center"><Tag className="w-5 h-5 text-orange-400" /></div>
                                        <div className="flex-1 min-w-0 flex flex-col justify-center items-start">
                                            <input type="text" placeholder={`雜物名稱 ${idx + 1} (例: 專卡/海報)`} value={misc.name} onChange={(e) => handleMiscChange(misc.id, 'name', e.target.value)} onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()} className="w-full text-sm font-bold text-gray-800 bg-transparent border-b border-transparent focus:border-orange-400 outline-none pb-0.5 placeholder-gray-300 mb-1 transition-colors" />
                                            {Number(misc.sellPrice) > 0 && (
                                                <div className="flex items-center gap-1 bg-green-50 px-2 py-1 rounded-lg w-fit active:scale-95 transition-transform">
                                                   <Calendar className="w-3.5 h-3.5 text-green-600" />
                                                   <input type="date" value={misc.sellDate} onChange={(e) => handleMiscChange(misc.id, 'sellDate', e.target.value)} onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()} className="bg-transparent text-xs font-bold text-green-600 outline-none w-24 p-0 cursor-pointer" />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 sm:gap-4 flex-shrink-0 w-full sm:w-auto justify-end border-t sm:border-t-0 pt-2 sm:pt-0 mt-1 sm:mt-0">
                                        <div className="flex flex-col items-end">
                                            <label className="text-[9px] text-green-500 font-bold uppercase mb-0.5">售出</label>
                                            <div className="flex items-baseline">
                                                <span className="text-[10px] font-bold text-green-500 mr-0.5">$</span>
                                                <input type="number" placeholder="0" step="50" min="0" value={misc.sellPrice} onChange={e => handleMiscChange(misc.id, 'sellPrice', e.target.value)} className="w-12 sm:w-14 text-right border-b border-gray-200 focus:border-green-400 outline-none font-bold text-base py-0.5 bg-transparent text-green-600 placeholder-green-200 transition-colors" />
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end">
                                            <label className="text-[9px] font-bold uppercase mb-0.5 flex items-center gap-1">
                                                {misc.isManual ? <span className="text-indigo-500">自訂購入</span> : <span className="text-red-400">購入</span>}
                                            </label>
                                            <div className="flex items-baseline">
                                                <span className={`text-[10px] font-bold mr-0.5 ${misc.isManual ? 'text-indigo-500' : 'text-red-500'}`}>$</span>
                                                <input 
                                                    type="number" placeholder="0" step="50" min="0" 
                                                    value={misc.buyPrice} 
                                                    onChange={e => handleMiscChange(misc.id, 'buyPrice', e.target.value)} 
                                                    className={`w-12 sm:w-14 text-right border-b border-gray-200 outline-none font-bold text-base py-0.5 bg-transparent transition-colors ${misc.isManual ? 'text-indigo-600 placeholder-indigo-200 focus:border-indigo-400' : 'text-red-600 placeholder-red-200 focus:border-red-400'}`} 
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {miscItems.length === 0 && <div className="text-center py-6 text-gray-400 border-2 border-dashed border-gray-200 rounded-xl bg-white text-xs">此{isSetMode ? '套' : '盤'}收未新增任何雜物。</div>}
                        </div>
                    </div>
                </div>
            </div>

            {cardToRemove && (
                <Modal title="移除卡片" onClose={() => setCardToRemove(null)} className="max-w-sm" footer={
                    <div className="flex gap-2 w-full">
                        <button onClick={() => setCardToRemove(null)} className="flex-1 py-3 rounded-xl border font-bold text-gray-500">取消</button>
                        <button onClick={() => {
                            const nextCardItems = cardItems.filter(i => i.uid !== cardToRemove.uid);                            const { nextCards, nextMisc, nextAlbums } = recalculatePrices(totalAmount, nextCardItems, miscItems, albumItems);
                            setCardItems(nextCards); 
                            setMiscItems(nextMisc);
                            setAlbumItems(nextAlbums);
                            syncToParent(form, totalAmount, nextCards, nextMisc, nextAlbums);
                            setCardToRemove(null);
                        }} className="flex-1 py-3 rounded-xl bg-red-500 text-white font-bold">確定移除</button>
                    </div>
                }>
                    <div className="p-6 text-center text-gray-600 text-sm">確定要從這筆盤收中移除「{cardToRemove.title}」嗎？<br/>這不會刪除卡片圖鑑本身。</div>
                </Modal>
            )}

            {miscToRemove && (
                <Modal title="移除雜物" onClose={() => setMiscToRemove(null)} className="max-w-sm" footer={
                    <div className="flex gap-2 w-full">
                        <button onClick={() => setMiscToRemove(null)} className="flex-1 py-3 rounded-xl border font-bold text-gray-500">取消</button>
                        <button onClick={() => {
                            const nextMisc = miscItems.filter(m => m.id !== miscToRemove.id);                            const { nextCards, nextMisc: recalculatedMisc, nextAlbums } = recalculatePrices(totalAmount, cardItems, nextMisc, albumItems);
                            setCardItems(nextCards);
                            setMiscItems(recalculatedMisc);
                            setAlbumItems(nextAlbums);
                            syncToParent(form, totalAmount, nextCards, recalculatedMisc, nextAlbums);
                            setMiscToRemove(null);
                        }} className="flex-1 py-3 rounded-xl bg-red-500 text-white font-bold">確定移除</button>
                    </div>
                }>
                    <div className="p-6 text-center text-gray-600 text-sm">確定要刪除雜物「{miscToRemove.name}」嗎？</div>
                </Modal>
            )}

            {albumToRemove && (
                <Modal title="移除專輯" onClose={() => setAlbumToRemove(null)} className="max-w-sm" footer={
                    <div className="flex gap-2 w-full">
                        <button onClick={() => setAlbumToRemove(null)} className="flex-1 py-3 rounded-xl border font-bold text-gray-500">取消</button>
                        <button onClick={() => {
                            const nextAlbums = albumItems.filter(a => a.uid !== albumToRemove.uid);                            const { nextCards, nextMisc, nextAlbums: recalculatedAlbums } = recalculatePrices(totalAmount, cardItems, miscItems, nextAlbums);
                            setCardItems(nextCards);
                            setMiscItems(nextMisc);
                            setAlbumItems(recalculatedAlbums);
                            syncToParent(form, totalAmount, nextCards, nextMisc, recalculatedAlbums);
                            setAlbumToRemove(null);
                        }} className="flex-1 py-3 rounded-xl bg-red-500 text-white font-bold">確定移除</button>
                    </div>
                }>
                    <div className="p-6 text-center text-gray-600 text-sm">確定要移除這個專輯項目嗎？</div>
                </Modal>
            )}

            {albumToSelect && (
                <Modal title="選擇專輯" onClose={() => setAlbumToSelect(null)} className="max-w-xl">
                    <div className="p-4 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4">
                        {albumOptions.map(album => (
                            <div 
                                key={album.id} 
                                onClick={() => {
                                    handleAlbumChange(albumToSelect, 'albumId', album.id);
                                    setAlbumToSelect(null);
                                }}
                                className="cursor-pointer group flex flex-col items-center gap-1"
                            >
                                <div className="w-full aspect-square rounded-lg bg-gray-100 overflow-hidden border group-hover:border-indigo-500 transition-all relative">
                                    {album.image ? <Image src={album.image} alt={album.name} fill sizes="150px" className="object-cover" unoptimized={true} /> : <Disc className="w-8 h-8 text-gray-300 m-auto" />}
                                </div>
                                <p className="text-xs font-bold text-center mt-1 group-hover:text-indigo-600 line-clamp-2">{album.name}</p>
                            </div>
                        ))}
                    </div>
                </Modal>
            )}

            {showCardSelector && <MiniCardSelector cards={cards} selectedItems={cardItems.map(c => ({ uid: c.uid, cardId: c.cardId }))} onConfirm={handleConfirmSelectCards} onClose={() => setShowCardSelector(false)} members={members} series={series} batches={batches} channels={channels} types={types} uniqueTypes={uniqueTypes} uniqueChannels={uniqueChannels} uniqueSeriesTypes={uniqueSeriesTypes} subunits={subunits} />}
        </div>
    );
}

function AddDataModal({ title, type, onClose, onSave, onDelete, onDuplicate, initialData = {}, extraOptions = {} }) {
  const isEdit = !!initialData.id;
  
  const [form, setForm] = useState({ 
    name: '', shortName: '', batchNumber: '', image: null, type: '', date: '', 
    seriesId: '', batchId: '', memberId: '', channel: '', memberIds: [], 
    sortOrder: 0, api: '', // 🌟 補上這個
    ...initialData,
    // 🌟 強制修正日期格式，避免 ISO String 導致 input date 顯示空白
    date: initialData.date ? String(initialData.date).split('T')[0] : ''
  });
  
  const [bulkImages, setBulkImages] = useState([]);
  const [enableCrop, setEnableCrop] = useState(true);

  // 🌟 新增：系列類型篩選狀態
  const [filterSeriesType, setFilterSeriesType] = useState(() => {
      if (initialData.seriesId && extraOptions.series) {
          const s = extraOptions.series.find(s => s.id === initialData.seriesId);
          return s?.type || 'All';
      }
      return 'All';
  });

  // 🌟 新增：根據類型篩選並排序後的系列列表
  const filteredSeries = useMemo(() => {
      let list = extraOptions.series || [];
      if (filterSeriesType !== 'All') {
          list = list.filter(s => s.type === filterSeriesType);
      }
      // 依日期排序，方便查找
      return list.sort((a, b) => new Date(a.date || '9999-12-31') - new Date(b.date || '9999-12-31'));
  }, [extraOptions.series, filterSeriesType]);

  const handleDuplicate = () => {
    const duplicatedForm = { ...form };
    delete duplicatedForm.id;
    if (duplicatedForm.name) duplicatedForm.name = duplicatedForm.name + ' (複製)';
    if (onDuplicate) onDuplicate(duplicatedForm);
    onClose();
  };

  const handleSave = () => {
    if (!form.name && type !== 'card') return alert('請輸入名稱');
    
    if (isEdit) {
        onSave(form);
    } else if (type === 'card' && bulkImages.length > 0) {
        const cardsToCreate = bulkImages.map(img => ({ ...form, image: img }));
        onSave(cardsToCreate);
    } else if (type === 'card' && form.memberIds && form.memberIds.length > 0) {
         const cardsToCreate = form.memberIds.map(mId => ({ ...form, memberId: mId, memberIds: undefined }));
        onSave(cardsToCreate);
    } else {
        onSave(form);
    }
    onClose();
  };

  return (
    <Modal title={title} onClose={onClose} footer={
      <div className="flex justify-between items-center w-full">
         <div className="flex gap-2">
             {(isEdit && ['card', 'series', 'batch', 'group', 'member', 'channel', 'type', 'subunit'].includes(type)) && (
                 <button 
                    onClick={() => { onDelete(type, initialData.id); onClose(); }} 
                    className="px-4 py-2 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 flex items-center gap-1 text-sm font-bold"
                 >
                     <Trash2 className="w-4 h-4" /> 刪除
                 </button>
             )}
             {isEdit && (type === 'batch' || type === 'series') && (
                 <button 
                    onClick={handleDuplicate} 
                    className="px-4 py-2 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 flex items-center gap-1 text-sm font-bold"
                 >
                     <Copy className="w-4 h-4" /> 複製
                 </button>
             )}
         </div>
         <div className={`flex gap-2 ${isEdit ? 'flex-1 justify-end ml-2' : 'w-full'}`}>
            <button onClick={onClose} className="flex-1 py-2 rounded-lg border text-gray-500 hover:bg-gray-100">取消</button>
            <button onClick={handleSave} className="flex-1 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 font-bold">
                {type === 'card' && bulkImages.length > 1 ? `批量建立 (${bulkImages.length}張)` : isEdit ? '儲存修改' : '確認新增'}
            </button>
         </div>
      </div>
    }>
      <div className="space-y-4">
       {type !== 'card' && type !== 'channel' && type !== 'type' && type !== 'subunit' && (
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">名稱</label>
              <input className="w-full border p-2 rounded-lg" placeholder="請輸入名稱" value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
            </div>
        )}

        {/* 🌟 新增成員的專屬排序與分隊輸入框 */}
        {type === 'member' && (
            <div className="space-y-3 bg-gray-50 p-3 rounded-xl border border-gray-100">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">所屬分隊 (選填)</label>
                <input 
                  type="text" 
                  placeholder="Ex. 舞蹈小分隊、子團名稱..." 
                  className="w-full border p-2 rounded-lg" 
                  value={form.subunit || ''} 
                  onChange={e => setForm({...form, subunit: e.target.value})} 
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">自訂排序 (數字越小排越前面)</label>
                <input 
                  type="number" 
                  className="w-full border p-2 rounded-lg" 
                  value={form.sortOrder ?? 0} 
                  onChange={e => setForm({...form, sortOrder: Number(e.target.value)})} 
                />
              </div>
            </div>
        )}

        {/* 🌟 分隊編輯表單 */}
        {type === 'subunit' && (
            <div className="space-y-3">
                <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">分隊名稱</label>
                    <input className="w-full border p-2 rounded-lg" placeholder="Ex. 舞蹈小分隊" value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
                </div>
                <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">排序 (數字越小排越前面)</label>
                    <input type="number" className="w-full border p-2 rounded-lg" value={form.sortOrder ?? 999} onChange={e => setForm({...form, sortOrder: Number(e.target.value)})} />
                </div>
            </div>
        )}

        {(type === 'channel' || type === 'type') && (
            <div className="space-y-3">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">{type === 'channel' ? '通路名稱' : '子類名稱'}</label>
                  <input className="w-full border p-2 rounded-lg" placeholder={`Ex. ${type === 'channel' ? 'Ktown4u' : '特典'}`} value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">簡稱 (選填)</label>
                  <input className="w-full border p-2 rounded-lg" placeholder={`Ex. ${type === 'channel' ? 'K4' : '特'}`} value={form.shortName || ''} onChange={e => setForm({...form, shortName: e.target.value})} />
                </div>
                {/* 🌟 只有「子類」才有自訂排序輸入框 */}
                {type === 'type' && (
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-1">自訂排序 (數字越小排越前面)</label>
                      <input 
                        type="number" 
                        className="w-full border p-2 rounded-lg" 
                        value={form.sortOrder ?? 0} 
                        onChange={e => setForm({...form, sortOrder: Number(e.target.value)})} 
                      />
                    </div>
                )}
            </div>
        )}

        {type === 'card' && !isEdit ? (
            <div className="space-y-2">
                {/* 🌟 新增的打勾核取方塊 */}
                <div className="flex items-center gap-2 mb-1">
                    <input 
                        type="checkbox" 
                        id="enableCrop"
                        checked={enableCrop} 
                        onChange={e => setEnableCrop(e.target.checked)} 
                        className="w-4 h-4 text-indigo-600 rounded cursor-pointer"
                    />
                    <label htmlFor="enableCrop" className="text-sm font-bold text-gray-700 cursor-pointer select-none">
                        上傳後進行圖片裁切與放大
                    </label>
                </div>

                <ImageUploader 
                    multiple={true}
                    images={bulkImages} 
                    image={form.image}
                    aspect={2/3}
                    enableCrop={enableCrop} // 🌟 把開關狀態傳進去
                    onChange={(imgs) => {
                        if (Array.isArray(imgs)) {
                            setBulkImages(imgs);
                            if (imgs.length === 1) setForm({...form, image: imgs[0]});
                        } else {
                            setForm({...form, image: imgs});
                        }
                    }} 
                    label="點擊上傳 (可多選)"
                    className="h-40"
                />
                {bulkImages.length > 1 && <p className="text-xs text-indigo-600 font-bold text-center">已選擇 {bulkImages.length} 張圖片，將建立 {bulkImages.length} 筆資料</p>}
            </div>
        ) : (
            type !== 'channel' && type !== 'type' && (
                <div className="space-y-2">
                    {/* 🌟 如果是「編輯小卡」，也顯示這個開關 */}
                    {type === 'card' && (
                        <div className="flex items-center gap-2 mb-1">
                            <input 
                                type="checkbox" 
                                id="enableCropEdit"
                                checked={enableCrop} 
                                onChange={e => setEnableCrop(e.target.checked)} 
                                className="w-4 h-4 text-indigo-600 rounded cursor-pointer"
                            />
                            <label htmlFor="enableCropEdit" className="text-sm font-bold text-gray-700 cursor-pointer select-none">
                                上傳後進行圖片裁切與放大
                            </label>
                        </div>
                    )}
                    <ImageUploader 
                        aspect={type === 'card' ? 2/3 : 1} 
                        image={form.image} 
                        enableCrop={type === 'card' ? enableCrop : true} // 🌟 只有小卡受開關影響，其他預設還是要裁切
                        onChange={img => setForm({...form, image: img})} 
                    />
                </div>
            )
        )}
        {type === 'series' && (
           <div className="space-y-3">
               <div>
                 <label className="block text-sm font-bold text-gray-700 mb-1">簡稱 (選填)</label>
                 <input className="w-full border p-2 rounded-lg" placeholder="Ex. 迷一" value={form.shortName || ''} onChange={e => setForm({...form, shortName: e.target.value})} />
               </div>
               
               {/* 🌟 新增系列的所屬分隊 */}
               <div>
                 <label className="block text-sm font-bold text-gray-700 mb-1">所屬分隊 (選填，無則留空)</label>
                 <input className="w-full border p-2 rounded-lg" placeholder="Ex. 舞蹈小分隊..." value={form.subunit || ''} onChange={e => setForm({...form, subunit: e.target.value})} />
               </div>

               <FormCapsuleSelect 
                label="系列類型"
                options={extraOptions.seriesTypes || []}
                value={form.type}
                onChange={val => setForm({...form, type: val})}
                allowCustom={true}
                placeholder="輸入新類型..."
              />
              <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">發行日期</label>
                  <input type="date" className="w-full border p-2 rounded-lg" value={form.date || ''} onChange={e => setForm({...form, date: e.target.value})} />
              </div>
              <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">KOCA API ID (選填)</label>
                  <input type="text" className="w-full border p-2 rounded-lg" placeholder="Ex. 565" value={form.api || ''} onChange={e => setForm({...form, api: e.target.value})} />
              </div>
           </div>
        )}

        {type === 'batch' && (
           <div className="space-y-3">
               <div>
                 <label className="block text-sm font-bold text-gray-700 mb-1">批次編號 (選填)</label>
                 <input className="w-full border p-2 rounded-lg" placeholder="Ex. 1.0, 2.0..." value={form.batchNumber || ''} onChange={e => setForm({...form, batchNumber: e.target.value})} />
               </div>
               <FormCapsuleSelect 
                label="所屬系列"
                options={extraOptions.series || []}
                value={form.seriesId}
                onChange={val => setForm({...form, seriesId: val})}
                renderOption={s => s.name}
              />
              <FormCapsuleSelect 
                label="子類 (Type)"
                options={extraOptions.types || []}
                value={form.type}
                onChange={val => setForm({...form, type: val})}
                allowCustom={true}
                placeholder="輸入..."
                renderOption={t => typeof t === 'object' ? t.name : t}
              />
              <FormCapsuleSelect 
                label="通路 (Channel)"
                options={extraOptions.channels || []}
                value={form.channel}
                onChange={val => setForm({...form, channel: val})}
                allowCustom={true}
                placeholder="輸入..."
                renderOption={c => typeof c === 'object' ? c.name : c}
              />
              <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">發行日期</label>
                  <input type="date" className="w-full border p-2 rounded-lg" value={form.date || ''} onChange={e => setForm({...form, date: e.target.value})} />
              </div>
           </div>
        )}

        {type === 'card' && (
          <div className="space-y-4">
             <FormCapsuleSelect 
                label={!isEdit ? "選擇成員 (可多選)" : "成員"}
                options={extraOptions.members || []}
                value={!isEdit && form.memberIds.length > 0 ? form.memberIds : form.memberId}
                onChange={val => !isEdit ? setForm({...form, memberIds: Array.isArray(val) ? val : [val], memberId: Array.isArray(val) ? val[0] : val}) : setForm({...form, memberId: val})}
                multiple={!isEdit}
                renderOption={m => (
                  <>
                    <img src={m.image} className="w-4 h-4 rounded-full" />
                    {m.name}
                  </>
                )}
             />

             {/* 🌟 新增：系列類型篩選 */}
             <FormCapsuleSelect 
                label="系列類型篩選"
                options={['All', ...(extraOptions.seriesTypes || [])]}
                value={filterSeriesType}
                onChange={val => setFilterSeriesType(val)}
                renderOption={t => t === 'All' ? '全部' : t}
             />

             <FormCapsuleSelect 
                label="系列"
                options={filteredSeries} // 🌟 改用篩選後的列表
                value={form.seriesId}
                onChange={val => setForm({...form, seriesId: val, batchId: ''})} 
                renderOption={s => s.name}
             />

             <FormCapsuleSelect 
                label="子類 (Type)"
                options={extraOptions.types || []}
                value={form.type}
                onChange={val => setForm({...form, type: val})}
                allowCustom={true}
                placeholder="輸入..."
                renderOption={t => typeof t === 'object' ? t.name : t}
             />

             <FormCapsuleSelect 
                label="通路 (Channel)"
                options={extraOptions.channels || []}
                value={form.channel}
                onChange={val => setForm({...form, channel: val})}
                allowCustom={true}
                placeholder="輸入..."
                renderOption={c => typeof c === 'object' ? c.name : c}
             />

             <FormCapsuleSelect 
                label="批次"
                options={extraOptions.batches?.filter(b => !form.seriesId || b.seriesId === form.seriesId) || []}
                value={form.batchId}
                onChange={val => {
                    const selectedBatch = extraOptions.batches?.find(b => b.id === val);
                    setForm(prev => ({
                        ...prev, 
                        batchId: val,
                        // 🌟 修正：把 selectedBatch 放前面！優先強制帶入批次綁定的子類與通路
                        type: selectedBatch?.type || prev.type || '',
                        channel: selectedBatch?.channel || prev.channel || ''
                    }));
                }}
                renderOption={b => b.name}
             />
          </div>
        )}
      </div>
    </Modal>
  );
}

function BulkOwnModal({ cards, selectedItems, onClose, onSave, series, batches, channels, types }) {
    const [form, setForm] = useState({ buyDate: new Date().toISOString().split('T')[0], source: '' });
    const [totalAmount, setTotalAmount] = useState('');
    
    const [cardItems, setCardItems] = useState(
        (selectedItems || []).map(item => ({
            uid: item.uid || `temp_${Date.now()}_${Math.random()}`,
            cardId: item.cardId, buyPrice: '', sellPrice: '', isManual: false
        }))
    );

    const recalculatePrices = (totalVal, currentCardItems) => {
        if (totalVal === '' || totalVal === undefined) {
            return currentCardItems.map(c => c.isManual ? c : { ...c, buyPrice: '' });
        }
        const total = Number(totalVal) || 0;
        let manualSum = 0; let autoQty = 0;
        currentCardItems.forEach(c => {
            if (c.isManual) manualSum += Number(c.buyPrice) || 0;
            else autoQty += 1;
        });
        
        const remaining = Math.max(0, total - manualSum);
        const autoPrice = autoQty > 0 ? Math.round(remaining / autoQty) : '';
        
        let hasChanges = false;
        const next = currentCardItems.map(c => {
            if (!c.isManual && c.buyPrice !== autoPrice) {
                hasChanges = true;
                return { ...c, buyPrice: autoPrice };
            }
            return c;
        });
        return hasChanges ? next : currentCardItems;
    };

    const handleTotalAmountChange = (e) => {
        const val = e.target.value; setTotalAmount(val);
        setCardItems(recalculatePrices(val, cardItems));
    };

    const handleCardChange = (uid, field, value) => {
        let nextItems = cardItems.map(c => {
            if (c.uid === uid) {
                const updated = { ...c, [field]: value };
                if (field === 'buyPrice') updated.isManual = (value !== '' && Number(value) !== 0);
                return updated;
            }
            return c;
        });
        if (field === 'buyPrice') nextItems = recalculatePrices(totalAmount, nextItems);
        setCardItems(nextItems);
    };

    const handleConfirm = () => {
        const itemsToSave = cardItems.map(item => ({
            cardId: item.cardId, buyDate: form.buyDate, source: form.source,
            quantity: 1, buyPrice: Number(item.buyPrice) || 0, sellPrice: Number(item.sellPrice) || 0, note: ''
        }));
        onSave(itemsToSave);
    };

    return (
        <Modal title={`批量入庫 (${cardItems.length})`} onClose={onClose} className="max-w-2xl" footer={
            <div className="flex gap-2 w-full">
                <button onClick={onClose} className="flex-1 py-3 rounded-lg border font-bold text-gray-500">取消</button>
                <button onClick={handleConfirm} className="flex-1 py-3 rounded-lg bg-black text-white font-bold">確認入庫</button>
            </div>
        }>
            <div className="space-y-6">
                <div className="bg-gray-50 p-4 rounded-xl grid grid-cols-2 gap-4 border mb-2">
                    <div>
                        <label className="text-xs font-bold text-gray-500 mb-1 block">購買日期</label>
                        <input type="date" value={form.buyDate} onChange={e => setForm({...form, buyDate: e.target.value})} className="w-full border p-2 rounded-lg bg-white" />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-gray-500 mb-1 block">來源 (選填)</label>
                        <input type="text" placeholder="Ex. 韓拍" value={form.source} onChange={e => setForm({...form, source: e.target.value})} className="w-full border p-2 rounded-lg bg-white" />
                    </div>
                    <div className="col-span-2 bg-red-50/50 p-4 rounded-xl flex flex-col justify-center gap-1 border border-red-100/50 relative">
                        <div className="flex justify-between items-center">
                            <label className="text-[10px] font-bold text-red-600 uppercase tracking-wider">批量總金額 (將自動均分單價)</label>
                            {cardItems.filter(c=>c.isManual).length > 0 && <span className="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded font-bold shadow-sm">已有 {cardItems.filter(c=>c.isManual).length} 張自訂單價</span>}
                        </div>
                        <div className="flex items-baseline mt-1">
                            <span className="text-xl text-red-600 font-bold mr-1">$</span>
                            <input type="number" placeholder="0" step="50" min="0" value={totalAmount} onChange={handleTotalAmountChange} className="w-full bg-transparent text-3xl font-black text-red-600 outline-none placeholder-red-200" />
                        </div>
                    </div>
                </div>

                <div className="space-y-3 max-h-[45vh] overflow-y-auto no-scrollbar px-1 pb-4">
                    {cardItems.map((item, idx) => {
                        const card = (cards || []).find(c => String(c.id) === String(item.cardId));
                        if (!card) return null;
                        const cardSeries = (series || []).find(s => String(s.id) === String(card.seriesId));
                        const cardBatch = (batches || []).find(b => String(b.id) === String(card.batchId));
                        const typeObj = (types || []).find(t => String(t.id) === String(card.type) || t.name === card.type);
                        const channelObj = (channels || []).find(c => String(c.id) === String(card.channel) || c.name === card.channel);
                        const displayTitle = [cardSeries?.shortName || cardSeries?.name, [(channelObj?.shortName || channelObj?.name), cardBatch?.batchNumber].filter(Boolean).join(''), typeObj?.shortName || typeObj?.name].filter(Boolean).join(' ');

                        return (
                            <div key={item.uid} className={`flex items-center gap-4 bg-white p-2 border-b last:border-b-0 transition-colors ${item.isManual ? 'bg-indigo-50/30' : ''}`}>
                                <div className="flex items-center gap-4 flex-1 min-w-0">
                                    <div className="w-12 aspect-[2/3] flex-shrink-0 bg-gray-100 rounded overflow-hidden border relative">
                                        {card.image ? (
                                            <Image src={card.image} alt="卡片圖片" fill className="object-cover pointer-events-none" sizes="15vw" unoptimized={true} />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-gray-300"><ImageIcon className="w-4 h-4" /></div>
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-xs font-bold text-gray-800 truncate">{displayTitle || '未命名卡片'}</div>
                                        {cardBatch?.name && <div className="text-[10px] text-gray-500 truncate">{cardBatch.name}</div>}
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 sm:gap-4 flex-shrink-0 w-auto justify-end">
                                    <div className="flex flex-col items-end">
                                        <label className="text-[9px] text-green-500 font-bold uppercase mb-0.5">售出</label>
                                        <div className="flex items-baseline">
                                            <span className="text-[10px] font-bold text-green-500 mr-0.5">$</span>
                                            <input type="number" placeholder="0" step="50" min="0" value={item.sellPrice} onChange={e => handleCardChange(item.uid, 'sellPrice', e.target.value)} className="w-12 sm:w-14 text-right border-b border-gray-200 focus:border-green-400 outline-none font-bold text-base py-0.5 bg-transparent text-green-600 placeholder-green-200 transition-colors" />
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-end">
                                        <label className="text-[9px] font-bold uppercase mb-0.5 flex items-center gap-1">
                                            {item.isManual ? <span className="text-indigo-500">自訂購入</span> : <span className="text-red-400">購入</span>}
                                        </label>
                                        <div className="flex items-baseline">
                                            <span className={`text-[10px] font-bold mr-0.5 ${item.isManual ? 'text-indigo-500' : 'text-red-500'}`}>$</span>
                                            <input type="number" placeholder="0" step="50" min="0" value={item.buyPrice} onChange={e => handleCardChange(item.uid, 'buyPrice', e.target.value)} className={`w-12 sm:w-14 text-right border-b border-gray-200 outline-none font-bold text-base py-0.5 bg-transparent transition-colors ${item.isManual ? 'text-indigo-600 placeholder-indigo-200 focus:border-indigo-400' : 'text-red-600 placeholder-red-200 focus:border-red-400'}`} />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </Modal>
    );
}

function CardMarkInput({ initialValue, onSave }) {
    const [val, setVal] = useState(initialValue || '');
    const isDirty = val !== (initialValue || '');

    return (
        <div className="flex items-center gap-0.5 bg-white/95 border border-indigo-400 rounded shadow-sm p-0.5 pointer-events-auto max-w-full" onClick={(e) => e.stopPropagation()}>
            <input
                type="text"
                value={val}
                onChange={(e) => setVal(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && isDirty && onSave(val)}
                placeholder="標記..."
                className="w-12 sm:w-16 text-[11px] text-indigo-900 font-bold px-1 outline-none text-right bg-transparent min-w-0"
            />
            <button
                onClick={() => isDirty && onSave(val)}
                disabled={!isDirty}
                className={`p-0.5 rounded-sm transition-all flex-shrink-0 ${isDirty ? 'bg-indigo-600 text-white hover:bg-indigo-700 cursor-pointer shadow-sm' : 'bg-green-500 text-white cursor-default'}`}
                title={isDirty ? "點擊儲存" : "已儲存"}
            >
                <Check className="w-3 h-3" />
            </button>
        </div>
    );
}
function ExportTab({ currentGroupId, groups, cards, customLists, setCustomLists, setViewingCard, isExportMode, setIsExportMode, sales, inventory, members, series, batches, channels, types, cols, setCols, showDetails, setShowDetails, subunits, appSettings, onUpdateSetting, showPrices, setShowPrices }) {
    // ==========================================
    // 1. 狀態宣告 (確保順序與唯一性)
    // ==========================================
    const [activeListId, setActiveListId] = useState(customLists?.[0]?.id || '');
    const [showCardSelector, setShowCardSelector] = useState(false);
    
    // 🌟 核心視圖狀態：預設 null，讓畫面一開始顯示資料夾選單
    const [activeView, setActiveView] = useState(null);
    const [isListModalOpen, setIsListModalOpen] = useState(false);
    const [editingListId, setEditingListId] = useState(null);
    const [listTitleInput, setListTitleInput] = useState('');
    const [listGroupIdInput, setListGroupIdInput] = useState('');
    const [listToDelete, setListToDelete] = useState(null);
    const clickTimer = useRef(null);

    // 🌟 新增：匯出範圍與隱藏卡片狀態
    const [exportStartRow, setExportStartRow] = useState(1);
    const [exportEndRow, setExportEndRow] = useState(0); // 0 代表全部
    const [isHideMode, setIsHideMode] = useState(false);
    const [hiddenCardIds, setHiddenCardIds] = useState(new Set());
    
    const [is4x6Mode, setIs4x6Mode] = useState(false);
    const [cardsPerPage, setCardsPerPage] = useState(8);
    const [sortDirection, setSortDirection] = useState('asc'); // asc: 舊到新, desc: 新到舊
    
    // 🌟 眼睛長按邏輯 (隱藏/顯示價格)
    const pricePressTimer = useRef(null);
    const hasPriceLongPressed = useRef(false);

    const startPricePress = () => {
        hasPriceLongPressed.current = false;
        pricePressTimer.current = setTimeout(() => {
            hasPriceLongPressed.current = true;
            if (activeView === 'selling') {
                setShowPrices(prev => !prev);
            }
        }, 600);
    };

    const cancelPricePress = () => clearTimeout(pricePressTimer.current);
    
    const handleEyeClick = (e) => {
        if (hasPriceLongPressed.current) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }
        setShowDetails(!showDetails);
    };

    // 🌟 篩選過濾器狀態 (改為複選陣列)
    const [filterSubunits, setFilterSubunits] = useState([]);
    const [filterMembers, setFilterMembers] = useState([]);
    const [filterTypes, setFilterTypes] = useState([]);
    const [filterColors, setFilterColors] = useState([]);

    const [showSeriesModal, setShowSeriesModal] = useState(false);
    const [filterSeriesType, setFilterSeriesType] = useState('All');
    const [filterSeries, setFilterSeries] = useState([]);
    const [filterBatches, setFilterBatches] = useState([]);

    const exportRef = useRef(null);
    const [isExporting, setIsExporting] = useState(false);
    const [exportedImages, setExportedImages] = useState([]);
    const [isEditMode, setIsEditMode] = useState(false);
    const [cardMarks, setCardMarks] = useState({});

    // 🌟 自訂排序 & 隱藏模式相關狀態
    const [customOrder, setCustomOrder] = useState([]);
    const [isReorderMode, setIsReorderMode] = useState(false);
    const [reorderSelectedId, setReorderSelectedId] = useState(null);
    const [customExportTitle, setCustomExportTitle] = useState(null); // 🌟 新增：自訂標題狀態

    const swipeHandlers = useSwipeToClose(() => setActiveView(null));

    // ==========================================
    // 2. 效能升級字典與資料池
    // ==========================================
    const inventoryMap = useMemo(() => {
        const map = {};
        (inventory || []).forEach(inv => {
            if (!inv.sellPrice || inv.sellPrice <= 0) {
                map[inv.cardId] = (map[inv.cardId] || 0) + Number(inv.quantity || 1);
            }
        });
        return map;
    }, [inventory]);

    const salesMap = useMemo(() => {
        const map = {};
        (sales || []).forEach(s => {
            if (Number(s.quantity) > 0) map[String(s.cardId)] = s;
        });
        return map;
    }, [sales]);

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

    const poolCards = useMemo(() => {
        if (!activeView) return [];
        if (activeView === 'owned') return (cards || []).filter(c => (inventoryMap[c.id] || 0) > 0);
        if (activeView === 'wishlist') return (cards || []).filter(c => c.isWishlist);
        if (activeView === 'selling') return (cards || []).filter(c => salesMap[String(c.id)]);
        if (typeof activeView === 'object' && activeView.items) {
            return activeView.items.map(item => (cards || []).find(c => String(c.id) === String(item.cardId))).filter(Boolean);
        }
        return [];
    }, [activeView, cards, inventoryMap, salesMap]);

    // ==========================================
    // 3. 連動過濾器邏輯
    // ==========================================
    const availableSubunits = useMemo(() => {
        const ids = new Set(poolCards.map(c => String(c.memberId)));
        const usedNames = [...new Set((members || []).filter(m => ids.has(String(m.id))).map(m => m.subunit).filter(Boolean))];
        
        // 🌟 排序邏輯
        const subunitSortMap = new Map();
        (subunits || []).forEach(s => {
            const current = subunitSortMap.get(s.name);
            if (current === undefined || (s.sortOrder !== undefined && s.sortOrder < current)) {
                subunitSortMap.set(s.name, s.sortOrder ?? 999);
            }
        });

        return usedNames.map(name => ({
            id: name,
            name: name,
            sortOrder: subunitSortMap.has(name) ? subunitSortMap.get(name) : 999
        })).sort((a, b) => a.sortOrder - b.sortOrder);
    }, [poolCards, members, subunits]);

    const subunitFilteredCards = useMemo(() => {
        if (filterSubunits.length === 0) return poolCards;
        return poolCards.filter(c => {
            const m = memberMap[String(c.memberId)];
            const s = seriesMap[String(c.seriesId)];
            return (m && filterSubunits.includes(m.subunit)) || (s && filterSubunits.includes(s.subunit));
        });
    }, [poolCards, filterSubunits, memberMap, seriesMap]);

    const availableMembers = useMemo(() => {
        const ids = new Set(subunitFilteredCards.map(c => String(c.memberId)));
        return (members || []).filter(m => ids.has(String(m.id)));
    }, [subunitFilteredCards, members]);

    const availableTypes = useMemo(() => {
        const ids = new Set(subunitFilteredCards.map(c => String(c.type)).filter(t => t !== 'null' && t !== 'undefined' && t !== ''));
        const currentTypes = (types || []).filter(t => ids.has(String(t.id)) || ids.has(t.name));
        // 🌟 修正：補回未定義在 types 列表中的自訂子類
        ids.forEach(id => {
            if (!currentTypes.some(t => String(t.id) === id || t.name === id)) {
                currentTypes.push({ id, name: id, shortName: '', sortOrder: 999 });
            }
        });
        return currentTypes.sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0));
    }, [subunitFilteredCards, types]);

    // 🌟 新增：顏色篩選 (僅限販售模式)
    const availableColors = useMemo(() => {
        if (activeView !== 'selling') return [];
        const colors = new Set();
        subunitFilteredCards.forEach(c => {
            const s = salesMap[String(c.id)];
            if (s) colors.add(s.color || 'bg-black/70');
        });
        return [...colors];
    }, [activeView, subunitFilteredCards, salesMap]);

    const availableSeriesTypes = useMemo(() => {
        const ids = new Set(poolCards.map(c => String(c.seriesId)));
        return [...new Set((series || []).filter(s => ids.has(String(s.id))).map(s => s.type).filter(Boolean))];
    }, [poolCards, series]);
    
    const availableSeriesList = useMemo(() => {
        let filtered = (series || []).filter(s => poolCards.some(c => String(c.seriesId) === String(s.id)));
        if (filterSubunits.length > 0) {
            filtered = filtered.filter(s => filterSubunits.includes(s.subunit));
        }
        if (filterSeriesType !== 'All') {
            filtered = filtered.filter(s => s.type === filterSeriesType);
        }
        return filtered.sort((a, b) => new Date(b.date || '1970-01-01') - new Date(a.date || '1970-01-01'));
    }, [poolCards, series, filterSeriesType, filterSubunits]);

    const availableBatchesList = useMemo(() => {
        let filtered = (batches || []).filter(b => poolCards.some(c => String(c.batchId) === String(b.id)));
        if (filterSubunits.length > 0) {
            const validSeriesIds = new Set((series || []).filter(s => filterSubunits.includes(s.subunit)).map(s => String(s.id)));
            filtered = filtered.filter(b => validSeriesIds.has(String(b.seriesId)));
        }
        if (filterSeries.length > 0) {
            filtered = filtered.filter(b => filterSeries.includes(String(b.seriesId)));
        }
        return filtered.sort((a, b) => new Date(b.date || '1970-01-01') - new Date(a.date || '1970-01-01'));
    }, [poolCards, batches, filterSeries, filterSubunits, series]);

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

    // 處理視圖切換時的 UI 狀態重置
    useEffect(() => {
        setFilterSubunits([]);
        setFilterMembers([]);
        setFilterTypes([]);
        setFilterColors([]);
        setFilterSeriesType('All');
        setFilterSeries([]);
        setFilterBatches([]);
        setIsEditMode(false);
        setCardMarks({}); 
        setIsReorderMode(false);
        setReorderSelectedId(null);
        setIsHideMode(false);
        setHiddenCardIds(new Set());
        setCustomExportTitle(null); // 🌟 切換視圖時重置標題
    }, [activeView]);

    // 從資料庫清單中讀取跨裝置的自訂排序
    useEffect(() => {
        if (activeView) {
            let savedOrder = [];
            if (typeof activeView === 'string') {
                const pref = (customLists || []).find(l => String(l.id) === `sys_sort_${activeView}`);
                if (pref && pref.items) {
                    savedOrder = pref.items.map(i => typeof i === 'object' ? i.cardId : i);
                }
            } else if (activeView.items) {
                savedOrder = activeView.items.map(i => typeof i === 'object' ? i.cardId : i);
            }
            
            // 比對新舊陣列避免不必要的重新渲染
            setCustomOrder(prev => JSON.stringify(prev) !== JSON.stringify(savedOrder) ? savedOrder : prev);
        }
    }, [activeView, customLists]);

    // ==========================================
    // 4. 取得顯示卡片與終極排序
    // ==========================================
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

    const getDisplayCards = () => {
        const filtered = subunitFilteredCards.filter(c => {
            if (filterMembers.length > 0 && !filterMembers.includes(String(c.memberId))) return false;
            if (filterTypes.length > 0) {
                const typeValue = String(c.type);
                const typeObj = typeMap[typeValue];
                // 檢查卡片的 type (可能是 id 或 name) 是否對應到任何一個被選中的篩選項目
                const cardTypeMatches = typeObj ? (filterTypes.includes(String(typeObj.id)) || filterTypes.includes(typeObj.name)) : filterTypes.includes(typeValue);
                if (!cardTypeMatches) return false;
            }
            
            if (filterSeries.length > 0 && !filterSeries.includes(String(c.seriesId))) return false;
            if (filterSeriesType !== 'All' && filterSeries.length === 0) {
                const s = seriesMap[String(c.seriesId)];
                if (!s || s.type !== filterSeriesType) return false;
            }
            if (filterBatches.length > 0 && !filterBatches.includes(String(c.batchId))) return false;
            
            if (activeView === 'selling' && filterColors.length > 0) {
                 const saleRecord = salesMap[String(c.id)];
                 const color = saleRecord?.color || 'bg-black/70';
                 if (!filterColors.includes(color)) return false;
            }
            return true;
        }).map(c => {
            if (activeView === 'selling') {
                const saleRecord = salesMap[String(c.id)];
                return { ...c, note: `$${saleRecord?.price || 0}`, noteColor: saleRecord?.color || 'bg-black/70' };
            }
            if (typeof activeView === 'object' && activeView.items) {
                const item = activeView.items.find(i => String(i.cardId) === String(c.id));
                return { ...c, note: item?.note };
            }
            return c;
        });

        // 🌟 先執行預設排序
        const defaultSorted = filtered.sort((cardA, cardB) => {
            const safeString = (val) => val ? String(val) : '';
            const safeNum = (val, defaultVal) => { const n = Number(val); return isNaN(n) ? defaultVal : n; };

            const hasBatchA = !!cardA.batchId;
            const hasBatchB = !!cardB.batchId;

            // 🌟 0. 無批次的小卡排在有批次的小卡後
            if (hasBatchA !== hasBatchB) return hasBatchA ? -1 : 1;

            const sA = seriesMap[String(cardA.seriesId)];
            const sB = seriesMap[String(cardB.seriesId)];
            const dateA_series = sA?.date ? new Date(sA.date).getTime() : 253402214400000;
            const dateB_series = sB?.date ? new Date(sB.date).getTime() : 253402214400000;

            if (!hasBatchA && !hasBatchB) {
                // 🌟 無批次排序：系列時間 -> 小卡名稱 -> 成員順序
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

            const typeA = typeMap[String(cardA.type)];
            const typeB = typeMap[String(cardB.type)];
            const sortA_type = typeA ? safeNum(typeA.sortOrder, 999) : 999;
            const sortB_type = typeB ? safeNum(typeB.sortOrder, 999) : 999;
            if (sortA_type !== sortB_type) return sortA_type - sortB_type;
            const bA = batchMap[String(cardA.batchId)];
            const bB = batchMap[String(cardB.batchId)];
            const dateA_batch = bA?.date ? new Date(bA.date).getTime() : 253402214400000;
            const dateB_batch = bB?.date ? new Date(bB.date).getTime() : 253402214400000;
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

        // 🌟 切換新舊順序
        if (sortDirection === 'desc') {
            defaultSorted.reverse();
        }

        // 🌟 如果有自訂排序，則依照自訂順序重排 (優先度高)
        if (customOrder.length > 0) {
            const orderMap = new Map(customOrder.map((id, index) => [id, index]));
            return defaultSorted.sort((a, b) => {
                const indexA = orderMap.has(a.id) ? orderMap.get(a.id) : 999999;
                const indexB = orderMap.has(b.id) ? orderMap.get(b.id) : 999999;
                return indexA - indexB;
            });
        }
        return defaultSorted;
    };

    // 🌟 重構：先取得所有符合篩選條件的卡片
    const allCardsForView = getDisplayCards() || [];

    // 🌟 重構：再根據是否為隱藏模式，決定是否要排除已隱藏的卡片
    const displayCards = useMemo(() => {
        if (isHideMode) return allCardsForView;
        return allCardsForView.filter(c => !hiddenCardIds.has(c.id));
    }, [allCardsForView, isHideMode, hiddenCardIds]);

    // 🌟 1. 先定義 maxRows (必須在 useEffect 和 cardsToRender 之前)
    const maxRows = useMemo(() => {
        if (!displayCards) return 0;
        return Math.ceil(displayCards.length / cols);
    }, [displayCards, cols]);

    // 🌟 2. 再定義 useEffect (依賴 maxRows)
    useEffect(() => {
        if (maxRows > 0 && (exportEndRow === 0 || exportEndRow > maxRows)) {
            setExportEndRow(maxRows);
        }
        if (exportStartRow > maxRows) {
            setExportStartRow(maxRows > 0 ? maxRows : 1);
        }
    }, [maxRows, exportStartRow, exportEndRow]);

    // 🌟 3. 最後定義 cardsToRender (依賴 maxRows)
    const cardsToRender = useMemo(() => {
        const start = Math.max(1, exportStartRow);
        const end = exportEndRow > 0 ? exportEndRow : maxRows;
        if (start > 1 || end < maxRows) {
            const startIndex = (start - 1) * cols;
            const endIndex = end * cols;
            return displayCards.slice(startIndex, endIndex);
        }
        return displayCards;
    }, [displayCards, exportStartRow, exportEndRow, cols, maxRows]);

    // 🌟 自動切換 4x6 張數預設值
    useEffect(() => {
        if (is4x6Mode) {
            const defaultCardsMap = { 15: 45, 14: 42, 13: 39, 12: 36, 11: 33, 10: 30, 9: 27, 8: 16, 7: 14, 6: 12, 5: 5, 4: 4, 3: 3, 2: 2, 1: 1 };
            setCardsPerPage(defaultCardsMap[cols] || Math.max(1, cols * 3));
        }
    }, [is4x6Mode, cols]);

    const chunkedCards = useMemo(() => {
        if (!is4x6Mode) return [cardsToRender];
        const chunks = [];
        for (let i = 0; i < cardsToRender.length; i += cardsPerPage) {
            chunks.push(cardsToRender.slice(i, i + cardsPerPage));
        }
        return chunks;
    }, [is4x6Mode, cardsToRender, cardsPerPage]);

    // ==========================================
    // 5. 事件與功能函式
    // ==========================================
    const handleSaveList = async () => {
        if(listTitleInput.trim()) {
            const payload = { title: listTitleInput.trim(), groupId: listGroupIdInput || currentGroupId };
            if (editingListId) {
                payload.id = editingListId;
                setCustomLists((customLists || []).map(l => l.id === editingListId ? { ...l, ...payload } : l));
            } else {
                const { data: { user } } = await supabase.auth.getUser();
                payload.id = Date.now().toString(); // 🌟 復原為純數字，相容資料庫的 bigint 格式
                payload.items = [];
                if (user) {
                    payload.userId = user.id;
                }
                setCustomLists([...(customLists || []), payload]);
            }
            
            const { error } = await supabase.from('custom_lists').upsert(toSnakeCase(payload));
            if (error) {
                alert("儲存失敗: " + error.message);
            } else {
                setIsListModalOpen(false);
                setEditingListId(null);
                setListTitleInput('');
                setListGroupIdInput('');
            }
        }
    };

    const handleListClick = (e, list) => {
        e.stopPropagation();
        if (clickTimer.current) {
            clearTimeout(clickTimer.current);
            clickTimer.current = null;
            setEditingListId(list.id);
            setListTitleInput(list.title);
            setListGroupIdInput(list.groupId || currentGroupId);
            setIsListModalOpen(true);
        } else {
            clickTimer.current = setTimeout(() => {
                setActiveView(list);
                clickTimer.current = null;
            }, 250);
        }
    };

    const handleDeleteList = async () => {
        if (!listToDelete) return;
        setCustomLists((customLists || []).filter(l => l.id !== listToDelete));
        await supabase.from('custom_lists').delete().eq('id', listToDelete);
        setListToDelete(null);
    };

    const handleExportPNG = async (exportTitle) => {
        if (!exportRef.current) return;
        setIsEditMode(false);
        setIsExporting(true);
        
        // 🌟 致命錯誤修正：等待 React 完成 setIsExporting(true) 所觸發的畫面重繪。
        // 如果不等待，React 會在我們轉 Base64 的途中，將 img.src 強制覆寫回原本的網址，
        // 導致 Base64 轉換失效，html-to-image 依然讀不到圖片而變成灰底！
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const element = exportRef.current;
        const overlay = element.parentElement; 
        const origOverlayStyle = overlay.style.cssText;
        const origElementStyle = element.style.cssText;
        const origScrollTop = overlay.scrollTop;

        try {
            overlay.style.cssText += 'position: absolute !important; top: 0 !important; left: 0 !important; right: 0 !important; bottom: auto !important; height: auto !important; max-height: none !important; min-height: 100vh !important; overflow: visible !important; z-index: 9999 !important; align-items: flex-start !important;';
            element.style.cssText += 'display: block !important; height: max-content !important; max-height: none !important; overflow: visible !important; background-color: #ffffff !important; padding-bottom: 60px !important; margin: 0 !important; transform: none !important; align-items: flex-start !important;';
            window.scrollTo(0, 0);

            // 🌟 動態等待所有圖片真正載入完畢，避免網速慢導致 html-to-image 抓到尚未載入的灰底
            const imgElements = Array.from(element.querySelectorAll('img'));
            await Promise.all(imgElements.map(img => {
                if (img.complete && img.naturalHeight > 0) return Promise.resolve();
                return new Promise((resolve) => {
                    const check = () => resolve();
                    img.addEventListener('load', check, { once: true });
                    img.addEventListener('error', () => {
                        setTimeout(resolve, 800); // 發生 CORS 錯誤時，給予 800ms 讓 onError 救援載入原圖
                    }, { once: true });
                });
            }));
            await new Promise(resolve => setTimeout(resolve, 1000));

            // 🌟 終極殺手鐧：在 html-to-image 處理前，強制將所有圖片轉為 Base64！
            // 徹底解決 Safari 的 Canvas 快取 Bug (多張圖片變成同一張)，以及代理伺服器防刷問題！
            imgElements.forEach(img => {
                try {
                    if (img.src.startsWith('data:') || !img.complete || img.naturalHeight === 0) return;
                    const canvas = document.createElement('canvas');
                    canvas.width = img.naturalWidth || img.width || 100;
                    canvas.height = img.naturalHeight || img.height || 100;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    const dataUrl = canvas.toDataURL('image/jpeg', 0.85); // 壓縮避免 OOM
                    
                    img.dataset.originalSrc = img.src; // 備份原始網址
                    img.removeAttribute('crossOrigin'); // 移除跨域標籤
                    img.src = dataUrl;
                } catch (e) {
                    console.warn('Canvas Base64 轉換失敗:', e);
                }
            });
            await new Promise(resolve => setTimeout(resolve, 300)); // 讓 DOM 有時間重新渲染 Base64

            if (is4x6Mode) {
                const pages = element.querySelectorAll('.export-page');
                const dataUrls = [];
                for (let i = 0; i < pages.length; i++) {
                    const page = pages[i];
                    const origPageStyle = page.style.cssText;
                    page.style.cssText += 'display: block !important; height: max-content !important; max-height: none !important; overflow: visible !important; background-color: #ffffff !important; margin: 0 !important; transform: none !important; align-self: flex-start !important;';
                    
                    const exportOptions = {
                        pixelRatio: 1.5, backgroundColor: '#ffffff', cacheBust: false, skipAutoScale: true, useCORS: true, 
                        imagePlaceholder: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
                        width: page.scrollWidth, height: page.scrollHeight, 
                        style: { height: `${page.scrollHeight}px`, maxHeight: 'none', overflow: 'visible', backgroundColor: '#ffffff', margin: '0', transform: 'none', alignSelf: 'flex-start' },
                        filter: (node) => {
                            if (node?.classList?.contains('no-export') || node?.classList?.contains('no-print') || node?.classList?.contains('card-is-hidden-for-export')) return false;
                            return true;
                        }
                    };
                    dataUrls.push(await htmlToImage.toPng(page, exportOptions));
                    page.style.cssText = origPageStyle;
                    
                    // 🌟 加上延遲，讓瀏覽器釋放記憶體，並避免短時間內瞬間轉檔過多圖片
                    await new Promise(resolve => setTimeout(resolve, 800));
                }
                setExportedImages(dataUrls);
            } else {
                element.style.cssText += 'display: block !important; height: max-content !important; max-height: none !important; overflow: visible !important; background-color: #ffffff !important; padding-bottom: 60px !important; margin: 0 !important; transform: none !important; align-self: flex-start !important;';
                const exportOptions = {
                    pixelRatio: 1.5, backgroundColor: '#ffffff', cacheBust: false, skipAutoScale: true, useCORS: true, 
                    imagePlaceholder: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
                    width: element.scrollWidth, height: element.scrollHeight, 
                    style: { height: `${element.scrollHeight}px`, maxHeight: 'none', overflow: 'visible', backgroundColor: '#ffffff', paddingBottom: '60px', margin: '0', transform: 'none', alignSelf: 'flex-start' },
                    filter: (node) => {
                        if (node?.classList?.contains('no-export') || node?.classList?.contains('no-print') || node?.classList?.contains('card-is-hidden-for-export')) return false;
                        return true;
                    }
                };
                setExportedImages([await htmlToImage.toPng(element, exportOptions)]);
            }
        } catch (error) {
            console.error('Export failed:', error);
            let msg = '未知錯誤';
            if (error) {
                 if (typeof error === 'string') msg = error;
                 else if (error.message) msg = error.message;
                 else if (error.type && error.type === 'error') msg = '圖片載入失敗，請檢查網路連線或圖片來源';
                 else msg = String(error);
            }
            alert(`匯出圖片失敗 (若範圍太大請嘗試減少排數): ${msg}`);
        } finally {
            // 🌟 匯出完成後，將畫面上的圖片無縫復原為真實網址，不影響原先顯示
            const imgElements = Array.from(element?.querySelectorAll('img') || []);
            imgElements.forEach(img => {
                if (img.dataset.originalSrc) {
                    img.crossOrigin = "anonymous";
                    img.src = img.dataset.originalSrc;
                    delete img.dataset.originalSrc;
                }
            });

            if (overlay && element) {
                overlay.style.cssText = origOverlayStyle;
                element.style.cssText = origElementStyle;
                overlay.scrollTop = origScrollTop;
            }
            setIsExporting(false);
        }
    };

    // 🌟 處理自訂排序按鈕的複雜點擊與長按邏輯
    const sortPressTimer = useRef(null);
    const resetSortTimer = useRef(null);
    const hasTriggeredAction = useRef(false);

    const handleSortButtonPressStart = () => {
        hasTriggeredAction.current = false;
        // Timer for hide mode (800ms)
        sortPressTimer.current = setTimeout(() => {
            setIsHideMode(prev => !prev);
            setIsReorderMode(false); // 隱藏模式與排序模式互斥
            hasTriggeredAction.current = true;
        }, 800);

        // Timer for reset (5 seconds)
        resetSortTimer.current = setTimeout(() => {
            resetCustomSort();
            hasTriggeredAction.current = true;
        }, 5000);
    };

    const handleSortButtonPressEnd = (e) => {
        clearTimeout(sortPressTimer.current);
        clearTimeout(resetSortTimer.current);
        if (hasTriggeredAction.current) {
            e.preventDefault();
        }
    };

    const handleSortButtonClick = () => {
        if (!hasTriggeredAction.current) { setIsReorderMode(!isReorderMode); setIsEditMode(false); setIsHideMode(false); }
    };

    // 🌟 處理自訂排序邏輯
    const handleReorderClick = async (cardId) => {
        if (!reorderSelectedId) {
            setReorderSelectedId(cardId);
        } else if (reorderSelectedId === cardId) {
            setReorderSelectedId(null);
        } else {
            // 移動卡片：將 selectedId 移動到 cardId 之前
            const currentList = displayCards.map(c => c.id);
            const fromIndex = currentList.indexOf(reorderSelectedId);
            const toIndex = currentList.indexOf(cardId);
            
            if (fromIndex !== -1 && toIndex !== -1) {
                const newList = [...currentList];
                const [movedItem] = newList.splice(fromIndex, 1);
                newList.splice(toIndex, 0, movedItem);
                
                setCustomOrder(newList);
                
                // 同步排序結果至資料庫
                if (typeof activeView === 'string') {
                    const prefId = `sys_sort_${activeView}`;
                    const payload = { 
                        id: prefId, 
                        title: `sys_sort_${activeView}`, 
                        items: newList.map(cid => ({ cardId: cid })) 
                    };
                    
                    if (!(customLists || []).some(l => String(l.id) === prefId)) {
                        setCustomLists([...(customLists || []), payload]);
                    } else {
                        setCustomLists((customLists || []).map(l => String(l.id) === prefId ? payload : l));
                    }
                    await supabase.from('custom_lists').upsert(toSnakeCase(payload));
                } else {
                    const updatedItems = newList.map(cid => {
                        const existingItem = (activeView.items || []).find(i => (i.cardId || i) === cid);
                        return existingItem || { cardId: cid };
                    });
                    const payload = { ...activeView, items: updatedItems };
                    setActiveView(payload);
                    setCustomLists((customLists || []).map(l => l.id === payload.id ? payload : l));
                    await supabase.from('custom_lists').upsert(toSnakeCase(payload));
                }
            }
            setReorderSelectedId(null);
        }
    };

    const resetCustomSort = async () => {
        if (confirm('確定要恢復為自動排序嗎？\n這將會清除目前的自訂排序紀錄。')) {
            setCustomOrder([]);
            setIsReorderMode(false);
            
            if (typeof activeView === 'string') {
                const prefId = `sys_sort_${activeView}`;
                setCustomLists((customLists || []).filter(l => String(l.id) !== prefId));
                await supabase.from('custom_lists').delete().eq('id', prefId);
            } else {
                alert("自訂收藏冊將維持手動排列順序。");
            }
        }
    };

    // 🌟 處理隱藏模式下的卡片點擊
    const handleCardClickInHideMode = (cardId) => {
        setHiddenCardIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(cardId)) newSet.delete(cardId);
            else newSet.add(cardId);
            return newSet;
        });
    };
    
    const handleConfirmSelectCards = async (newSelectedItems) => {
        if (typeof activeView !== 'object' || !activeView.id) return;
        
        const nextItems = newSelectedItems.map(item => {
            const existing = (activeView.items || []).find(i => String(i.cardId) === String(item.cardId));
            return existing || { cardId: item.cardId, note: '' };
        });
        
        const payload = { ...activeView, items: nextItems };
        setActiveView(payload);
        setCustomLists((customLists || []).map(l => l.id === payload.id ? payload : l));
        await supabase.from('custom_lists').upsert(toSnakeCase(payload));
        
        setShowCardSelector(false);
    };

    // ==========================================
    // 6. 內部渲染元件
    // ==========================================
    const RenderFilterSection = ({ label, options, current, onChange, mapName, isColor = false }) => (
       <div className="flex items-center gap-3 overflow-hidden no-export no-print">
          <span className="text-[10px] font-bold text-gray-400 whitespace-nowrap min-w-fit">{label}</span>
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 flex-1">
              {(options || []).map(opt => {
                  const id = typeof opt === 'object' ? opt.id : opt;
                  const name = mapName ? mapName(opt) : (typeof opt === 'object' ? opt.name : opt);
                  const isSelected = current.includes(String(id));
                  
                  if (isColor) {
                      return (
                          <button
                              key={id}
                              onClick={() => onChange(String(id))}
                              className={`w-6 h-6 rounded-full border-2 transition-all ${id} ${isSelected ? 'border-gray-600 scale-110 ring-1 ring-gray-400 shadow-sm' : 'border-transparent opacity-40 hover:opacity-100'}`}
                              title={name}
                          />
                      );
                  }

                  return (
                      <button 
                          key={id}
                          onClick={() => onChange(String(id))}
                          className={`px-3 py-1 text-xs rounded-full whitespace-nowrap border select-none transition-all ${isSelected ? 'bg-indigo-600 border-indigo-600 text-white font-bold' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'}`}
                      >
                          {name}
                      </button>
                  )
              })}
          </div>
       </div>
    );

    const toggleFilter = (setFunc, val) => {
        setFunc(prev => prev.includes(val) ? prev.filter(x => x !== val) : [...prev, val]);
    };
    
    const CardGrid = ({ displayCards }) => (
        <div className="grid gap-3 sm:gap-4" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
            {displayCards.map((card, idx) => {
                const cardSeries = (series || []).find(s => String(s.id) === String(card.seriesId));
                const seriesName = cardSeries?.shortName || cardSeries?.name;
                const cardBatch = (batches || []).find(b => String(b.id) === String(card.batchId));
                const effectiveType = card.type;
                const typeObj = (types || []).find(t => String(t.id) === String(effectiveType) || t.name === effectiveType);
                const displayType = typeObj ? (typeObj.shortName || typeObj.name) : effectiveType;
                const effectiveChannelId = card.channel;
                const channelObj = (channels || []).find(c => String(c.id) === String(effectiveChannelId) || c.name === effectiveChannelId);
                const displayChannel = channelObj ? (channelObj.shortName || channelObj.name) : effectiveChannelId;
                const batchNumber = cardBatch?.batchNumber;
                const channelAndBatch = [displayChannel, batchNumber].filter(Boolean).join('');
                const displayTitle = [seriesName, channelAndBatch, displayType].filter(Boolean).join(' ');

                // 🌟 計算販售數量
                const saleRecord = activeView === 'selling' ? salesMap[String(card.id)] : null;
                const sellQty = saleRecord ? (Number(saleRecord.quantity) || 0) : 0;

                // 🌟 針對外部 API 匯入的小卡圖片，自動掛上 corsproxy 代理伺服器，解決 html-to-image 無法截取跨域圖片導致灰底的問題。
                let exportImgUrl = null;
                if (card.image) {
                    const isExternalAPI = card.image.startsWith('http') && !card.image.includes('supabase.co') && typeof window !== 'undefined' && !card.image.includes(window.location.hostname);
                    if (isExternalAPI) {
                        // 🌟 終極修復：解決「輸出時多張小卡變成同一張圖」的雙重致命問題：
                        // 1. Safari Canvas 緩存 Bug：強制加上 v=ID，確保每張圖片 URL 絕對唯一，防止 Canvas 錯用上一張圖片的緩存。
                        // 2. 目標 API 防刷機制：將請求平均分散到三個不同的頂級代理，避免單一 IP 瞬間請求過多而被攔截回傳預設錯誤圖。
                        const encodedUrl = encodeURIComponent(card.image);
                        const proxies = [
                            `https://corsproxy.io/?${encodedUrl}`,
                            `https://api.codetabs.com/v1/proxy/?quest=${encodedUrl}`,
                            `https://images.weserv.nl/?url=${encodedUrl}&w=800`
                        ];
                        // 用卡片 ID 產生穩定 Hash，讓同一張卡固定使用同一個代理以命中快取
                        let hash = 0;
                        for (let i = 0; i < String(card.id).length; i++) hash = String(card.id).charCodeAt(i) + ((hash << 5) - hash);
                        const proxyIndex = Math.abs(hash) % proxies.length;
                        
                        exportImgUrl = `${proxies[proxyIndex]}&v=${card.id}`;
                    } else {
                        exportImgUrl = card.image.includes('?') ? `${card.image}&export_cors=1&v=${card.id}` : `${card.image}?export_cors=1&v=${card.id}`;
                    }
                }

                return (
                    <div 
                        key={card.id} 
                        onClick={() => {
                            if (isHideMode) {
                                handleCardClickInHideMode(card.id);
                            } else if (isReorderMode) {
                                handleReorderClick(card.id);
                            } else if (!isEditMode) {
                                setViewingCard(card);
                            }
                        }} 
                        className={`flex flex-col gap-1 relative group cursor-pointer transition-all ${
                            isReorderMode 
                                ? (reorderSelectedId === card.id ? 'scale-95 ring-4 ring-indigo-500 rounded-lg z-10' : 'hover:scale-[0.98] opacity-90') 
                                : 'active:scale-95'
                        } ${
                            hiddenCardIds.has(card.id) ? 'card-is-hidden-for-export' : ''
                        }`}
                    >
                        <div className={`relative aspect-[2/3] bg-gray-100 rounded-lg border shadow-sm flex-shrink-0 overflow-hidden ${isReorderMode && reorderSelectedId === card.id ? 'border-indigo-500' : 'border-gray-200'}`}>
                            {card.image ? (
                                /* 🌟 修正：加入 crossOrigin 確保快取具備跨域權限 */
                                <img 
                                    src={exportImgUrl} 
                                    alt="卡片圖片" 
                                    crossOrigin="anonymous"
                                    onError={(e) => {
                                        // 🌟 破圖救援：如果第一線代理遇到特定阻擋，依序無縫切換其他代理，並加上唯一識別碼防 Safari 快取 Bug
                                        const originalUrl = encodeURIComponent(card.image);
                                        const fallbacks = [
                                            `https://api.allorigins.win/raw?url=${originalUrl}`,
                                            `https://images.weserv.nl/?url=${originalUrl}&w=800`,
                                            `https://corsproxy.io/?${originalUrl}`,
                                            `https://api.codetabs.com/v1/proxy/?quest=${originalUrl}`
                                        ];
                                        let currentAttempt = Number(e.target.dataset.fallbackIndex || 0);
                                        if (currentAttempt < fallbacks.length) {
                                            e.target.dataset.fallbackIndex = currentAttempt + 1;
                                            e.target.src = `${fallbacks[currentAttempt]}&v=${card.id}_fallback_${currentAttempt}`;
                                        }
                                    }}
                                    loading="eager"
                                    decoding="sync"
                                    className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                                />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-gray-300">
                                    <ImageIcon className="w-8 h-8" />
                                </div>
                            )}
                            <div className="absolute top-1 right-1 left-1 flex flex-col items-end gap-1 z-30 pointer-events-none">
                                {activeView === 'selling' && sellQty > 1 && (
                                    <div className="bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow-sm">
                                        x{sellQty}
                                    </div>
                                )}
                                {isEditMode ? (
                                    <CardMarkInput initialValue={cardMarks[card.id]} onSave={(newVal) => setCardMarks({...cardMarks, [card.id]: newVal})} />
                                ) : (
                                    cardMarks[card.id] && (
                                        <div className="inline-block bg-white/70 text-black text-[11px] font-bold px-2 pt-0 pb-[5px] rounded shadow-sm max-w-full break-words text-right pointer-events-none" style={{ lineHeight: '1.2' }}>{cardMarks[card.id]}</div>
                                    )
                                )}
                            </div>
                            {card.note && (activeView !== 'selling' || showPrices) && (
                                <div className="absolute bottom-1.5 left-0 w-full text-center z-20 px-1 pointer-events-none">
                                    <div className={`inline-block text-white font-bold px-2.5 py-1 rounded-full shadow-md max-w-full truncate ${card.noteColor || 'bg-black/70'}`} style={{ lineHeight: '1.2', fontSize: cols >= 6 ? '20px' : '36px' }}>{card.note}</div>
                                </div>
                            )}
                            {hiddenCardIds.has(card.id) && (
                                <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-20 rounded-lg backdrop-blur-sm">
                                    <EyeOff className="w-1/3 h-1/3 text-white/80" />
                                </div>
                            )}
                        </div>
                        {showDetails && (
                          <div className="px-0.5 sm:px-1">
                              <div className="text-xs sm:text-sm font-bold text-gray-800 leading-tight mb-0.5 line-clamp-2">{displayTitle || '未命名卡片'}</div>
                              {cardBatch?.name && <div className="text-[8px] sm:text-[9px] text-gray-400 mt-0.5 line-clamp-1">{cardBatch.name}</div>}
                          </div>
                        )}
                    </div>
                )
            })}
        </div>
    );

    // ==========================================
    // 7. 畫面回傳
    // ==========================================
    if (activeView) {
        const defaultExportTitle = activeView === 'owned' ? '我的擁有' : 
                      activeView === 'wishlist' ? '願望清單' : 
                      activeView === 'selling' ? '販售中' : 
                      activeView.title;
        const displayExportTitle = customExportTitle !== null ? customExportTitle : defaultExportTitle;

        return (
          <div className="fixed inset-0 z-[100] bg-gray-100 overflow-auto no-scrollbar flex flex-col items-center animate-fade-in" {...swipeHandlers}>
              <style>{`
                  @media print {
                      @page { ${is4x6Mode ? (cols >= 4 ? "size: 6in 4in; margin: 0;" : "size: 4in 6in; margin: 0;") : "margin: 8mm;"} }
                      body, html { overflow: visible !important; height: auto !important; background-color: #ffffff !important; }
                      .fixed.inset-0 { position: relative !important; overflow: visible !important; height: auto !important; background-color: #ffffff !important; display: block !important; }
                      .no-print { display: none !important; }
                      .export-page { box-shadow: none !important; border: none !important; width: 100% !important; max-width: none !important; ${is4x6Mode ? 'margin: 0 !important; border-radius: 0 !important; break-after: page; page-break-after: always;' : 'break-inside: avoid;'} }
                  }
              `}</style>
              <div className="w-full relative" ref={exportRef}>
                  {/* --- 控制列與過濾器 (匯出時自動隱藏) --- */}
                  <div className="no-export no-print mb-6 space-y-4 px-4 sm:px-8 mt-4 sm:mt-8 max-w-[1200px] mx-auto">
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white p-4 rounded-xl border shadow-sm gap-4 sm:gap-0">
                          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                              <button onClick={() => setActiveView(null)} className="p-1.5 sm:p-2 hover:bg-gray-100 rounded-full transition-colors flex-shrink-0">
                                  <ArrowLeft className="w-5 h-5 sm:w-6 sm:h-6" />
                              </button>
                              <h1 className="text-xl sm:text-2xl font-extrabold text-gray-900 tracking-tight truncate">{displayExportTitle}</h1>
                          </div>
                          <div className="flex items-center justify-start sm:justify-end w-full sm:w-auto gap-2 flex-wrap">
                              <div className="flex bg-gray-100 px-2 rounded-lg items-center h-8 gap-2">
                                  <Grid className="w-3.5 h-3.5 text-gray-400" />
                                  <input 
                                      type="range" 
                                      min="1" 
                                      max="15" 
                                      value={cols} 
                                      onChange={(e) => setCols(Number(e.target.value))} 
                                      className="w-16 sm:w-20 accent-indigo-600 cursor-pointer"
                                  />
                                  <span className="text-xs font-bold text-gray-600 min-w-[16px] text-center">{cols}</span>
                              </div>
                              <button 
                                  onClick={() => setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')} 
                                  className="px-3 py-1 rounded-lg transition-all h-8 flex items-center justify-center bg-gray-100 text-gray-600 hover:bg-gray-200 text-xs font-bold whitespace-nowrap"
                              >
                                  {sortDirection === 'asc' ? '舊到新' : '新到舊'}
                              </button>
                              {typeof activeView === 'object' && activeView.id && !String(activeView.id).startsWith('sys_sort_') && (
                                  <button onClick={() => setShowCardSelector(true)} className="text-xs bg-indigo-50 text-indigo-700 hover:bg-indigo-100 px-3 py-1.5 rounded-full flex items-center justify-center gap-1 font-bold transition-colors h-8 shadow-sm border border-indigo-100">
                                      <Plus className="w-3 h-3"/> 新增卡片
                                  </button>
                              )}
                              <button onMouseDown={handleSortButtonPressStart} onMouseUp={handleSortButtonPressEnd} onMouseLeave={handleSortButtonPressEnd} onTouchStart={handleSortButtonPressStart} onTouchEnd={handleSortButtonPressEnd} onClick={handleSortButtonClick} className={`p-2 rounded-lg transition-all h-8 flex items-center justify-center ${isReorderMode ? 'bg-indigo-600 text-white shadow-md ring-2 ring-indigo-200' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`} title="排序 | 長按切換隱藏模式 | 長按5秒重置排序">
                                  <ArrowUpDown className="w-4 h-4" />
                              </button>
                              <button onClick={() => setIsEditMode(!isEditMode)} className={`p-2 rounded-lg transition-all h-8 flex items-center justify-center ${isEditMode ? 'bg-indigo-200 text-indigo-800 shadow-inner' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`} title="在卡片上標記">
                                  <PenTool className="w-4 h-4" />
                              </button>
                              <button onMouseDown={startPricePress} onMouseUp={cancelPricePress} onMouseLeave={cancelPricePress} onTouchStart={startPricePress} onTouchEnd={cancelPricePress} onClick={handleEyeClick} className={`p-2 rounded-lg transition-all h-8 flex items-center justify-center ${showDetails ? 'bg-gray-200 text-gray-800' : 'bg-gray-100 text-gray-400'}`}>
                                  {showDetails ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                              </button>
                          </div>
                      </div>

                      <div className="space-y-3 p-4 bg-white rounded-xl border shadow-sm">
                          <RenderFilterSection label="分隊" options={availableSubunits} current={filterSubunits} onChange={(val) => toggleFilter(setFilterSubunits, val)} mapName={s => s.name} />
                          <RenderFilterSection label="成員" options={availableMembers} current={filterMembers} onChange={(val) => toggleFilter(setFilterMembers, val)} mapName={m => m.name} />
                          <RenderFilterSection label="子類" options={availableTypes} current={filterTypes} onChange={(val) => toggleFilter(setFilterTypes, val)} mapName={t => t.name} />
                          {activeView === 'selling' && <RenderFilterSection label="顏色" options={availableColors} current={filterColors} onChange={(val) => toggleFilter(setFilterColors, val)} isColor={true} />}
                          <div onClick={() => setShowSeriesModal(true)} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200 cursor-pointer hover:border-indigo-300 transition-all group mt-2">
                              <div className="flex items-center gap-2 overflow-hidden">
                                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">系列與版本</span>
                                  <div className="h-4 w-px bg-gray-300 mx-1"></div>
                                  <span className={`text-xs truncate font-medium ${getSeriesSummary() !== '全部系列' ? 'text-indigo-600' : 'text-gray-600'}`}>{getSeriesSummary()}</span>
                              </div>
                              <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-indigo-500" />
                          </div>
                          
                          <div className="flex flex-col sm:flex-row sm:items-center gap-4 pt-4 border-t mt-2">
                              <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-bold text-gray-400 whitespace-nowrap">匯出範圍</span>
                                  <input type="number" min="1" max={maxRows} value={exportStartRow} onChange={e => setExportStartRow(Math.max(1, Number(e.target.value)))} className="w-12 text-center bg-gray-50 border rounded-md text-xs font-bold p-1 outline-none focus:border-indigo-400" />
                                  <span className="text-xs font-bold text-gray-400">-</span>
                                  <input type="number" min="1" max={maxRows} value={exportEndRow} onChange={e => setExportEndRow(Math.min(maxRows, Number(e.target.value)))} className="w-12 text-center bg-gray-50 border rounded-md text-xs font-bold p-1 outline-none focus:border-indigo-400" />
                                  <span className="text-xs text-gray-500">排 (共 {maxRows} 排)</span>
                              </div>
                              
                              <div className="hidden sm:block w-px h-6 bg-gray-200"></div>

                              <div className="flex items-center gap-3">
                                  <span className="text-[10px] font-bold text-gray-400 whitespace-nowrap">排版格式</span>
                                  <div className="flex items-center gap-2 bg-gray-50 px-2 py-1 rounded-md border">
                                      <input type="checkbox" id="mode4x6" checked={is4x6Mode} onChange={e => setIs4x6Mode(e.target.checked)} className="w-3.5 h-3.5 text-indigo-600 rounded cursor-pointer" />
                                      <label htmlFor="mode4x6" className="text-xs font-bold text-gray-700 cursor-pointer select-none">4x6 多張分割</label>
                                  </div>
                                  {is4x6Mode && (
                                      <div className="flex items-center gap-2 bg-indigo-50 px-2 py-1 rounded-md border border-indigo-100">
                                          <span className="text-xs text-indigo-700 font-bold">每張</span>
                                          <input type="number" min="1" max="50" value={cardsPerPage} onChange={e => setCardsPerPage(Math.max(1, Number(e.target.value)))} className="w-12 text-center bg-white border rounded text-xs font-bold p-1 outline-none focus:border-indigo-400 text-indigo-700" />
                                          <span className="text-xs text-indigo-700 font-bold">卡片</span>
                                      </div>
                                  )}
                              </div>
                          </div>
                      </div>

                      {isHideMode && <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm font-bold rounded-lg text-center border border-red-100">隱藏模式：點擊卡片可將其從匯出圖片中隱藏 (已隱藏 {hiddenCardIds.size} 張)</div>}
                      {isReorderMode && <div className="mb-4 p-3 bg-indigo-50 text-indigo-700 text-sm font-bold rounded-lg text-center border border-indigo-100 animate-pulse">{reorderSelectedId ? "請點擊另一張卡片以插入其前方" : "請點擊一張卡片開始移動"}</div>}
                  </div>

                  {/* --- 匯出繪製區塊 --- */}
                  {is4x6Mode ? (
                      <div className="flex flex-col gap-6 sm:gap-10 pb-20 items-center px-4 sm:px-8 print:block print:p-0 print:m-0">
                          {chunkedCards.map((chunk, i) => (
                              <div key={i} className="export-page bg-white p-4 sm:p-8 shadow-md rounded-xl relative overflow-hidden border border-gray-200 mx-auto" style={{ width: '100%', maxWidth: cols >= 4 ? '1200px' : '800px', aspectRatio: cols >= 4 ? '3/2' : '2/3' }}>
                                  <div className="flex justify-between items-end mb-4 border-b-2 border-black pb-2">
                                      <h1 className="text-xl sm:text-3xl font-extrabold text-gray-900 tracking-tight flex flex-wrap items-baseline gap-1 sm:gap-2 min-w-0">
                                          <span 
                                              contentEditable 
                                              suppressContentEditableWarning 
                                              onBlur={(e) => setCustomExportTitle(e.target.textContent.trim())}
                                              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } }}
                                              className="outline-none hover:bg-gray-100 focus:bg-gray-100 focus:ring-2 focus:ring-indigo-200 rounded px-1 -ml-1 transition-all cursor-text min-w-[50px]"
                                              title="點擊直接修改標題"
                                          >
                                              {displayExportTitle}
                                          </span>
                                          <span className="whitespace-nowrap flex-shrink-0">({i+1}/{chunkedCards.length})</span>
                                      </h1>
                                      <div className="text-right flex-shrink-0 ml-2">
                                          <div className="text-xs sm:text-sm font-bold text-gray-400">CardKeeper</div>
                                          <div className="text-[10px] sm:text-xs text-gray-300">{new Date().toLocaleDateString()}</div>
                                      </div>
                                  </div>
                                  <CardGrid displayCards={chunk} />
                              </div>
                          ))}
                          {chunkedCards.length === 0 && <div className="text-center py-20 text-gray-400 w-full">沒有符合條件的卡片</div>}
                      </div>
                  ) : (
                      <div className="export-page bg-white p-4 sm:p-8 shadow-none min-h-screen w-full relative max-w-[1400px] mx-auto border-x border-gray-200/50">
                          <div className="flex justify-between items-end mb-4 border-b-2 border-black pb-2">
                              <h1 className="text-xl sm:text-3xl font-extrabold text-gray-900 tracking-tight min-w-0">
                                  <span 
                                      contentEditable 
                                      suppressContentEditableWarning 
                                      onBlur={(e) => setCustomExportTitle(e.target.textContent.trim())}
                                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } }}
                                      className="outline-none hover:bg-gray-100 focus:bg-gray-100 focus:ring-2 focus:ring-indigo-200 rounded px-1 -ml-1 transition-all cursor-text inline-block min-w-[50px]"
                                      title="點擊直接修改標題"
                                  >
                                      {displayExportTitle}
                                  </span>
                              </h1>
                              <div className="text-right flex-shrink-0 ml-2">
                                  <div className="text-xs sm:text-sm font-bold text-gray-400">CardKeeper</div>
                                  <div className="text-[10px] sm:text-xs text-gray-300">{new Date().toLocaleDateString()}</div>
                              </div>
                          </div>
                          <CardGrid displayCards={cardsToRender} />
                          {displayCards.length === 0 && <div className="text-center py-20 text-gray-400 w-full">沒有符合條件的卡片</div>}
                      </div>
                  )}
              </div>

              <div className="fixed bottom-8 inset-x-0 flex flex-wrap justify-center gap-3 pointer-events-none no-print z-50 px-4">
                  <button onClick={(e) => { e.preventDefault(); handleExportPNG(displayExportTitle); }} disabled={isExporting} className="bg-indigo-600 text-white px-6 sm:px-8 py-3.5 rounded-full shadow-[0_8px_30px_rgb(0,0,0,0.2)] font-bold hover:bg-indigo-700 transition-all pointer-events-auto flex items-center gap-2 disabled:opacity-70 disabled:cursor-wait">
                      <Download className="w-5 h-5" /> {isExporting ? '輸出中...' : '匯出長圖'}
                  </button>
              </div>

              {exportedImages.length > 0 && (
                  <Modal title="圖片已產生" onClose={() => setExportedImages([])} className="max-w-2xl" footer={
                          <div className="flex gap-2 w-full">
                              <button onClick={() => setExportedImages([])} className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 font-bold hover:bg-gray-50 transition-all">關閉預覽</button>
                              <button onClick={async () => {
                                  for (let idx = 0; idx < exportedImages.length; idx++) {
                                      const img = exportedImages[idx];
                                      const link = document.createElement('a');
                                      link.href = img;
                                      link.download = `${displayExportTitle}_${new Date().toISOString().split('T')[0]}${is4x6Mode ? `_${idx + 1}` : ''}.png`;
                                      document.body.appendChild(link);
                                      link.click();
                                      document.body.removeChild(link);
                                      // 🌟 加入短暫延遲，防止瀏覽器阻擋連續下載
                                      await new Promise(resolve => setTimeout(resolve, 300));
                                  }
                              }} className="flex-1 py-3 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 transition-all text-center flex items-center justify-center gap-2">
                                  <Download className="w-5 h-5" /> 下載全部 ({exportedImages.length}張)
                              </button>
                          </div>
                      }>
                      <div className="p-4 flex flex-col items-center max-h-[60vh] overflow-y-auto no-scrollbar">
                          <div className="bg-green-50 text-green-700 p-3 rounded-xl mb-4 w-full text-center text-sm font-bold border border-green-200 flex-shrink-0">
                              圖片產生成功！🎉<br/><span className="text-xs font-normal text-green-600">請點擊下方按鈕下載全部，或長按圖片個別儲存。</span>
                          </div>
                          <div className="flex flex-col gap-4 w-full max-w-md">
                              {exportedImages.map((img, idx) => (
                                  <div key={idx} className="border border-gray-200 rounded-xl overflow-hidden shadow-lg bg-white relative">
                                      {is4x6Mode && <div className="absolute top-2 left-2 bg-black/50 text-white text-xs px-2 py-1 rounded-md z-10">第 {idx + 1} 張</div>}
                                      <img src={img} alt={`Export Preview ${idx+1}`} className="w-full h-auto object-contain block pointer-events-auto" style={{ WebkitTouchCallout: 'default', userSelect: 'auto' }} />
                                  </div>
                              ))}
                          </div>
                      </div>
                  </Modal>
              )}

              {showCardSelector && typeof activeView === 'object' && (
                  <MiniCardSelector 
                      cards={cards} 
                      selectedItems={(activeView.items || []).map((i, idx) => ({ uid: `item_${idx}_${i.cardId}`, cardId: i.cardId }))} 
                      onConfirm={handleConfirmSelectCards} 
                      onClose={() => setShowCardSelector(false)} 
                      members={members} 
                      series={series} 
                      batches={batches} 
                      channels={channels} 
                      types={types} 
                      subunits={subunits} 
                  />
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
        );
    }

    return (
      <>
        <div className="p-4 space-y-8 pb-24">
            <section>
              <h3 className="font-bold text-lg text-gray-800 mb-4 px-1">系統分類</h3>
              <div className="grid grid-cols-3 gap-4">
                  <div onClick={() => setActiveView('owned')} className="bg-white aspect-square rounded-2xl border border-gray-100 shadow-sm flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-indigo-300 hover:shadow-md transition-all group">
                      <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 group-hover:scale-110 transition-transform"><Folder className="w-6 h-6 fill-current" /></div>
                      <span className="font-bold text-gray-700 text-sm">擁有</span>
                  </div>
                  <div onClick={() => setActiveView('wishlist')} className="bg-white aspect-square rounded-2xl border border-gray-100 shadow-sm flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-pink-300 hover:shadow-md transition-all group">
                      <div className="w-12 h-12 rounded-full bg-pink-50 flex items-center justify-center text-pink-600 group-hover:scale-110 transition-transform"><Heart className="w-6 h-6 fill-current" /></div>
                      <span className="font-bold text-gray-700 text-sm">想要</span>
                  </div>
                  <div onClick={() => setActiveView('selling')} className="bg-white aspect-square rounded-2xl border border-gray-100 shadow-sm flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-green-300 hover:shadow-md transition-all group">
                      <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center text-green-600 group-hover:scale-110 transition-transform"><ShoppingBag className="w-6 h-6" /></div>
                      <span className="font-bold text-gray-700 text-sm">販售</span>
                  </div>
              </div>
          </section>

          <section>
              <h3 className="font-bold text-lg text-gray-800 mb-4 px-1">我的收藏冊</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {(customLists || []).filter(l => !String(l.id).startsWith('sys_sort_') && (!l.groupId || String(l.groupId) === String(currentGroupId))).map(list => (
                      <div key={list.id} onClick={(e) => handleListClick(e, list)} className="bg-white p-3 sm:p-4 rounded-xl border border-gray-100 shadow-sm flex items-center justify-between cursor-pointer hover:border-indigo-300 hover:shadow-md transition-all group relative select-none">
                           <div className="flex items-center gap-3 min-w-0">
                               <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 flex-shrink-0 pointer-events-none"><BookOpen className="w-5 h-5 sm:w-6 sm:h-6" /></div>
                              <div className="flex flex-col min-w-0 pointer-events-none">
                                  <span className="font-bold text-gray-800 text-sm sm:text-base truncate">{list.title}</span>
                                  <span className="text-[10px] sm:text-xs text-gray-400">{(list.items || []).length} 張卡片</span>
                              </div>
                          </div>
                          <button onClick={(e) => { e.stopPropagation(); setListToDelete(list.id); }} className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"><Trash2 className="w-4 h-4 sm:w-5 sm:h-5" /></button>
                      </div>
                  ))}
                  
                  <div onClick={() => { setEditingListId(null); setListTitleInput(''); setListGroupIdInput(currentGroupId); setIsListModalOpen(true); }} className="bg-gray-50 p-3 sm:p-4 rounded-xl border-2 border-dashed border-gray-300 flex items-center gap-3 cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 transition-all group select-none">
                      <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-white flex items-center justify-center text-gray-400 group-hover:text-indigo-500 shadow-sm flex-shrink-0"><Plus className="w-5 h-5 sm:w-6 sm:h-6" /></div>
                      <span className="font-bold text-gray-500 group-hover:text-indigo-600 text-sm sm:text-base">新增收藏冊</span>
                  </div>
              </div>
          </section>
        </div>

        {isListModalOpen && (
            <Modal title={editingListId ? "編輯收藏冊" : "新增收藏冊"} onClose={() => { setIsListModalOpen(false); setEditingListId(null); setListTitleInput(''); setListGroupIdInput(''); }} className="max-w-sm" footer={
                <div className="flex gap-2 w-full">
                    <button onClick={() => { setIsListModalOpen(false); setEditingListId(null); setListTitleInput(''); setListGroupIdInput(''); }} className="flex-1 py-3 rounded-xl border font-bold text-gray-500 hover:bg-gray-50">取消</button>
                    <button onClick={handleSaveList} className="flex-1 py-3 rounded-xl bg-black text-white font-bold hover:bg-gray-800">{editingListId ? "儲存修改" : "確認新增"}</button>
                </div>
            }>
                <div className="p-4 space-y-4">
                    <div>
                        <label className="text-xs font-bold text-gray-500 mb-1.5 block">所屬團體</label>
                        <div className="relative">
                            <select value={listGroupIdInput} onChange={e => setListGroupIdInput(e.target.value)} className="w-full border p-3 rounded-xl bg-gray-50 focus:bg-white transition-colors outline-none focus:ring-2 focus:ring-indigo-100 appearance-none">
                                {(groups || []).map(g => (
                                    <option key={g.id} value={g.id}>{g.name}</option>
                                ))}
                            </select>
                            <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        </div>
                    </div>
                    <div>
                        <label className="text-xs font-bold text-gray-500 mb-1.5 block">收藏冊名稱</label>
                        <input autoFocus type="text" placeholder="例如：售物清單、保留區..." value={listTitleInput} onChange={e => setListTitleInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSaveList()} className="w-full border p-3 rounded-xl bg-gray-50 focus:bg-white transition-colors outline-none focus:ring-2 focus:ring-indigo-100" />
                    </div>
                </div>
            </Modal>
        )}

        {listToDelete && (
            <Modal title="刪除收藏冊" onClose={() => setListToDelete(null)} className="max-w-sm" footer={
                <div className="flex gap-2 w-full">
                    <button onClick={() => setListToDelete(null)} className="flex-1 py-3 rounded-xl border font-bold text-gray-500 hover:bg-gray-50">取消</button>
                    <button onClick={handleDeleteList} className="flex-1 py-3 rounded-xl bg-red-500 text-white font-bold hover:bg-red-600">確定刪除</button>
                </div>
            }>
                <div className="p-6 text-center text-gray-600 text-sm">確定要刪除這個收藏冊嗎？<br/>內含的卡片紀錄將從此清單移除，但不會刪除您的實際庫存。</div>
            </Modal>
        )}
      </>
    );
}

// --- 7. App Main Component ---
export default function App() {
  const [activeTab, setActiveTab] = useState('library');
  const [showGroupSelector, setShowGroupSelector] = useState(false);
  const [activeModal, setActiveModal] = useState(null); 
  
  // 🌟 初始化為空陣列 (準備接資料)
  const [groups, setGroups] = useState([]);
  const [currentGroupId, setCurrentGroupId] = useState(null);
  const [members, setMembers] = useState([]);
  const [series, setSeries] = useState([]);
  const [channels, setChannels] = useState([]);
  const [types, setTypes] = useState([]);
  const [batches, setBatches] = useState([]);
  const [cards, setCards] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [customLists, setCustomLists] = useState([]);
  const [sales, setSales] = useState([]);
  const [bulkRecords, setBulkRecords] = useState([]);
  const [subunits, setSubunits] = useState([]); // 🌟 新增 subunits 狀態
  const [appSettings, setAppSettings] = useState([]); // 🌟 新增全域設定狀態
  
  const [editingBulkRecord, setEditingBulkRecord] = useState(null); 

  const [libraryCols, setLibraryCols] = useState(6);
  const [collectionCols, setCollectionCols] = useState(6);
  const [exportCols, setExportCols] = useState(8);
  const [exportShowDetails, setExportShowDetails] = useState(true);
  const [exportShowPrices, setExportShowPrices] = useState(true); // 🌟 新增：控制販售價格顯示

  const [viewingCard, setViewingCard] = useState(null);
  const [isExportMode, setIsExportMode] = useState(false);
  const [modalState, setModalState] = useState({ type: null, data: null });
  
  const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [selectedItems, setSelectedItems] = useState([]);
    const [selectedBatches, setSelectedBatches] = useState([]);
  const [batchCategorizeTarget, setBatchCategorizeTarget] = useState(null); 
  const [categorizeSubBatchId, setCategorizeSubBatchId] = useState('');

  useEffect(() => {
      setCategorizeSubBatchId('');
  }, [batchCategorizeTarget]);

  // 🌟 新增：監聽 currentGroupId 改變，同步更新網址，讓不同團體有獨立網址
  useEffect(() => {
      const urlParams = new URLSearchParams(window.location.search);
      if (currentGroupId) {
          if (urlParams.get('group') !== String(currentGroupId)) {
              const newUrl = new URL(window.location.href);
              newUrl.searchParams.set('group', currentGroupId);
              if (!urlParams.has('group')) {
                  window.history.replaceState(null, '', newUrl.toString());
              } else {
                  window.history.pushState(null, '', newUrl.toString());
              }
          }
      } else if (urlParams.has('group') && groups.length > 0) {
          const newUrl = new URL(window.location.href);
          newUrl.searchParams.delete('group');
          window.history.replaceState(null, '', newUrl.toString());
      }
  }, [currentGroupId, groups.length]);

  // 🌟 新增：監聽瀏覽器上一頁/下一頁動作，同步切換團體
  useEffect(() => {
      const handlePopState = () => {
          const urlParams = new URLSearchParams(window.location.search);
          const urlGroupId = urlParams.get('group');
          if (urlGroupId && urlGroupId !== String(currentGroupId)) {
              setCurrentGroupId(urlGroupId);
          }
      };
      window.addEventListener('popstate', handlePopState);
      return () => window.removeEventListener('popstate', handlePopState);
  }, [currentGroupId]);

  // 🌟 新增：主頁左右滑動切換分頁
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const touchEndX = useRef(0);

  const handleTouchStart = (e) => {
      touchStartX.current = e.targetTouches[0].clientX;
      touchStartY.current = e.targetTouches[0].clientY;
  };

  const handleTouchEnd = (e) => {
      touchEndX.current = e.changedTouches[0].clientX;
      const touchEndY = e.changedTouches[0].clientY;
      const diff = touchStartX.current - touchEndX.current;
      const diffY = touchStartY.current - touchEndY;
      
      if (Math.abs(diffY) > Math.abs(diff)) return; // 垂直滑動忽略
      if (e.target.closest('input[type="range"]')) return; // 滑動條忽略

      // 門檻 100px，避免誤觸
      if (Math.abs(diff) > 100) {
          const tabs = ['library', 'collection', 'bulk', 'inventory', 'export'];
          const currentIndex = tabs.indexOf(activeTab);
          
          if (diff > 0) { // 左滑 (手指右->左) -> 下一頁
              if (currentIndex < tabs.length - 1) {
                  setActiveTab(tabs[currentIndex + 1]);
                  setIsSelectionMode(false);
                  setSelectedItems([]);
                  setSelectedBatches([]);
                  setBatchCategorizeTarget(null);
              }
          } else { // 右滑 (手指左->右) -> 上一頁
              if (currentIndex > 0) {
                  setActiveTab(tabs[currentIndex - 1]);
                  setIsSelectionMode(false);
                  setSelectedItems([]);
                  setSelectedBatches([]);
                  setBatchCategorizeTarget(null);
              }
          }
      }
  };

  // 🌟 從 Supabase 抓取所有資料
  useEffect(() => {
    async function fetchAllData() {
        const fetchTable = async (t, silent = false, options = {}) => { 
            try {
                // 🌟 改為呼叫 D1 API，不用再依賴 Supabase client，也無需手動分頁
                const params = new URLSearchParams({ table: t });
                if (options.paginate) params.append('paginate', 'true');
                if (options.orderBy) {
                    params.append('orderBy', options.orderBy);
                    params.append('ascending', String(options.ascending ?? true));
                }
                if (options.limit) params.append('limit', String(options.limit));
                
                const response = await fetch(`/api/data?${params.toString()}`);
                if (!response.ok) {
                    const errText = await response.text();
                    let errData: any = {};
                    try { errData = JSON.parse(errText); } catch (e) {}
                    throw new Error(`API 請求失敗: ${response.status} - ${errData.error || errText.substring(0, 100) || '未知的伺服器錯誤'}`);
                }
                
                const result = await response.json();
                console.log(`✅ [${t}] 成功讀取 ${result.data?.length || 0} 筆資料`);
                
                return (result.data || []).map(toCamelCase).map(item => {
                    // 🌟 核心防爆：處理 Cloudflare D1 (SQLite) 將 JSON 陣列轉為純字串的問題
                    if (typeof item.items === 'string') {
                        try { item.items = JSON.parse(item.items) || []; } catch(e) { item.items = []; }
                    }
                    if (typeof item.memberIds === 'string') {
                        try { item.memberIds = JSON.parse(item.memberIds) || []; } catch(e) { item.memberIds = []; }
                    }
                    return item;
                });
                
            } catch (error) {
                console.error(`🚨 [${t}] 讀取失敗:`, error.message);
                if (!silent && !error.message?.includes('AbortError') && !error.message?.includes('Lock was stolen')) {
                    alert(`讀取 ${t} 失敗！\n錯誤訊息: ${error.message}`);
                }
                return [];
            }
        };
        const fetchedGroups = await fetchTable('groups');
        setGroups(fetchedGroups);
        
        const urlParams = new URLSearchParams(window.location.search);
        const urlGroupId = urlParams.get('group');
        if (urlGroupId && fetchedGroups.some(g => String(g.id) === String(urlGroupId))) {
            setCurrentGroupId(urlGroupId);
        } else if (fetchedGroups.length > 0 && !currentGroupId) {
            setCurrentGroupId(fetchedGroups[0].id);
        }

        // 🌟 改為並行讀取，確保分隊資訊與成員同時到位，避免預設選取錯誤
        const [fetchedMembers, fetchedSubunits] = await Promise.all([
            fetchTable('members'),
            fetchTable('ui_subunits')
        ]);

        // 🌟 確保一開始載入就排好序
        setMembers(fetchedMembers.sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0)));
        setSubunits(fetchedSubunits);

        setSeries(await fetchTable('series'));
        setBatches(await fetchTable('batches'));
        setChannels(await fetchTable('channels'));
        setTypes(await fetchTable('types'));
        // 🌟 針對小卡使用分頁抓取所有資料，突破 10,000 筆限制
        setCards(await fetchTable('ui_cards', false, { paginate: true }));
        setInventory(await fetchTable('ui_inventory'));
        setBulkRecords(await fetchTable('bulk_records'));
        setCustomLists(await fetchTable('custom_lists'));
        setSales(await fetchTable('ui_sales'));
        setAppSettings(await fetchTable('ui_settings', true)); // 🌟 讀取全域設定 (排序紀錄)，若無資料表則靜默失敗
    }
    fetchAllData();
  }, []);

  useEffect(() => {
      const handleResize = () => {
          const isMobile = window.innerWidth < 768;
          if (isMobile) {
              setLibraryCols(prev => (prev === 6 ? 4 : prev));
              setCollectionCols(prev => (prev === 6 ? 4 : prev));
              setExportCols(prev => (prev === 8 ? 4 : prev));
          }
      };
      window.addEventListener('resize', handleResize);
      handleResize(); 
      return () => window.removeEventListener('resize', handleResize);
  }, []);

  const currentGroup = (groups || []).find(g => g.id === currentGroupId);

  // 🌟 核心過濾：根據當前團體 ID 篩選所有資料 (資料隔離的關鍵)
  const currentMembers = useMemo(() => (members || []).filter(m => String(m.groupId) === String(currentGroupId)).sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0)), [members, currentGroupId]);
  const currentSeries = useMemo(() => (series || []).filter(s => String(s.groupId) === String(currentGroupId)), [series, currentGroupId]);
  const currentBatches = useMemo(() => (batches || []).filter(b => String(b.groupId) === String(currentGroupId)), [batches, currentGroupId]);
  const currentChannels = useMemo(() => (channels || []), [channels]);
  const currentTypes = useMemo(() => (types || []), [types]);
  const currentSubunits = useMemo(() => (subunits || []).filter(s => String(s.groupId) === String(currentGroupId)), [subunits, currentGroupId]);
  const currentCards = useMemo(() => (cards || []).filter(c => String(c.groupId) === String(currentGroupId)), [cards, currentGroupId]);
  const currentBulkRecords = useMemo(() => (bulkRecords || []).filter(r => String(r.groupId) === String(currentGroupId)), [bulkRecords, currentGroupId]);

  const currentInventory = useMemo(() => {
      const cardIds = new Set(currentCards.map(c => String(c.id)));
      const bulkIds = new Set(currentBulkRecords.map(r => String(r.id)));
      const albumIds = new Set(currentSeries.filter(s => s.type === '專輯').map(s => String(s.id)));

      return (inventory || []).filter(inv => {
          if (inv.cardId && cardIds.has(String(inv.cardId))) return true;
          if (inv.bulkRecordId && bulkIds.has(String(inv.bulkRecordId))) return true;
          if (inv.albumId && albumIds.has(String(inv.albumId))) return true;
          return false;
      });
  }, [inventory, currentCards, currentBulkRecords, currentSeries]);

  const currentSales = useMemo(() => {
      const cardIds = new Set(currentCards.map(c => String(c.id)));
      return (sales || []).filter(s => cardIds.has(String(s.cardId)));
  }, [sales, currentCards]);

  // 🌟 強化版：子類 (Type) 依照你設定的 sortOrder 排序
  // 🌟 1. 強化版：子類 (Type) 依照你設定的 sortOrder 排序
  const combinedTypes = useMemo(() => {
      const dynamicTypeIds = new Set([
          ...currentCards.map(c => c.type),
          ...currentBatches.map(b => b.type)
      ].filter(Boolean));
      
      const combined = [...currentTypes];
      dynamicTypeIds.forEach(id => {
          if (!currentTypes.some(t => t.id === id || t.name === id)) {
              combined.push({ id, name: id, shortName: '', sortOrder: 999 }); // 未知子類放最後
          }
      });
      // 依照 sortOrder 數字大小排序
      return combined.sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0));
  }, [currentTypes, currentCards, currentBatches]);

  // 🌟 2. 恢復不小心被刪掉的 uniqueTypes
  const uniqueTypes = useMemo(() => 
    [...new Set([
        ...currentCards.map(c => c.type),
        ...currentBatches.map(b => b.type)
    ].filter(Boolean))], 
  [currentCards, currentBatches]);

  // 🌟 3. 強化版：通路 (Channel) 依照「使用頻率 (卡片數量)」由多到少排序
  const combinedChannels = useMemo(() => {
      const dynamicChannelIds = new Set([
          ...currentCards.map(c => c.channel),
          ...currentBatches.map(b => b.channel)
      ].filter(Boolean));
      
      const combined = [...currentChannels];
      dynamicChannelIds.forEach(id => {
          if (!currentChannels.some(c => c.id === id || c.name === id)) {
              combined.push({ id, name: id, shortName: '' });
          }
      });

      // 計算各通路的使用頻率
      const freqMap = {};
      currentCards.forEach(c => {
          if (c.channel) freqMap[c.channel] = (freqMap[c.channel] || 0) + 1;
      });

      // 依照使用頻率排序 (由大到小)
      return combined.sort((a, b) => {
          const freqA = freqMap[a.id] || freqMap[a.name] || 0;
          const freqB = freqMap[b.id] || freqMap[b.name] || 0;
          return freqB - freqA;
      });
  }, [currentChannels, currentCards, currentBatches]);

  // 🌟 4. 恢復不小心被刪掉的 uniqueChannels
  const uniqueChannels = useMemo(() => 
    [...new Set([
        ...currentCards.map(c => c.channel),
        ...currentBatches.map(b => b.channel)
    ].filter(Boolean))], 
  [currentCards, currentBatches]);

  const uniqueSeriesTypes = useMemo(() =>
    [...new Set(currentSeries.map(s => s.type).filter(Boolean))],
  [currentSeries]);

  const openModal = (type, data = {}) => setModalState({ type, data });
  const closeModal = () => setModalState({ type: null, data: null });

  // 🌟 新增：共用的圖片上傳函式
  const uploadImageToSupabase = async (base64String) => {
      // 如果沒有圖片，或是已經是 http 網址，就直接回傳
      if (!base64String || base64String.startsWith('http')) return base64String;

      try {
          const res = await fetch(base64String);
          const blob = await res.blob();
          const fileName = `image_${Date.now()}_${Math.floor(Math.random()*1000)}.jpg`;
          
          const { error: uploadError } = await supabase.storage
              .from('card-images') // 統一使用同一個儲存桶
              .upload(fileName, blob, { contentType: 'image/jpeg' });

          if (uploadError) throw uploadError;

          const { data: { publicUrl } } = supabase.storage
              .from('card-images')
              .getPublicUrl(fileName);

          return publicUrl;
      } catch (err) {
          console.error("圖片上傳失敗:", err);
          // 🌟 增加錯誤提示
          alert(`圖片上傳失敗！\n錯誤訊息: ${err.message || '未知錯誤'}\n請檢查 Supabase 儲存空間是否已滿 (402) 或網路連線 (502)。`);
          return null;
      }
  };

// 🌟 自動統整所有庫存與盤收的「來源」
  const uniqueSources = useMemo(() => {
      const invSources = (inventory || []).map(i => i.source);
      const bulkSources = (bulkRecords || []).map(r => r.source);
      return [...new Set([...invSources, ...bulkSources].filter(Boolean))].sort();
  }, [inventory, bulkRecords]);

  // 🌟 全域修改來源名稱的函式 (連動更新資料庫)
  const handleRenameSource = async (oldName, newName) => {
      if (!newName || oldName === newName) return;
      setInventory(prev => prev.map(i => i.source === oldName ? { ...i, source: newName } : i));
      setBulkRecords(prev => prev.map(r => r.source === oldName ? { ...r, source: newName } : r));
      await supabase.from('ui_inventory').update({ source: newName }).eq('source', oldName);
      await supabase.from('bulk_records').update({ source: newName }).eq('source', oldName);
  };

  // 🌟 全域刪除來源名稱的函式
  const handleDeleteSource = async (oldName) => {
      if (!window.confirm(`確定要刪除來源「${oldName}」嗎？相關卡片的來源都會被清空！`)) return;
      setInventory(prev => prev.map(i => i.source === oldName ? { ...i, source: '' } : i));
      setBulkRecords(prev => prev.map(r => r.source === oldName ? { ...r, source: '' } : r));
      await supabase.from('ui_inventory').update({ source: null }).eq('source', oldName);
      await supabase.from('bulk_records').update({ source: null }).eq('source', oldName);
  };

  // 🌟 更新全域設定 (例如自訂排序)
  const handleUpdateAppSetting = async (key, value) => {
      setAppSettings(prev => {
          const exists = prev.some(s => s.key === key);
          if (exists) return prev.map(s => s.key === key ? { ...s, value } : s);
          return [...prev, { key, value }];
      });
      const { error } = await supabase.from('ui_settings').upsert({ key, value });
      if (error) console.error('Error saving setting:', error);
  };

  // 👇 你的 handleSaveData 應該會緊接著在這邊
  // const handleSaveData = async (data, type, isEdit = false) => { ...

  // 🌟 通用儲存功能
  const handleSaveData = async (data, type, isEdit = false) => {
      const tableMap = { group: 'groups', member: 'members', series: 'series', batch: 'batches', channel: 'channels', type: 'types', card: 'ui_cards', subunit: 'ui_subunits' };
      const table = tableMap[type];

      const allowedKeys = {
          group: ['id', 'name', 'image'],
          member: ['id', 'groupId', 'name', 'image','sortOrder', 'subunit'],
          series: ['id', 'groupId', 'name', 'type', 'date', 'shortName', 'image', 'subunit', 'api'],
          batch: ['id', 'groupId', 'seriesId', 'name', 'type', 'channel', 'batchNumber', 'image', 'date'],
          channel: ['id', 'groupId', 'name', 'shortName'],
          type: ['id', 'groupId', 'name', 'shortName', 'sortOrder'],
          card: ['id', 'groupId', 'memberId', 'seriesId', 'batchId', 'name', 'type', 'channel', 'image', 'isWishlist'],
          subunit: ['id', 'groupId', 'name', 'sortOrder', 'user_id']
      };

      const cleanData = (obj) => {
          const cleaned = {};
          (allowedKeys[type] || []).forEach(key => {
              if (obj[key] !== undefined) {
                  // 🌟 修正：如果是日期欄位且為空字串，轉為 null，避免資料庫報錯
                  if (key === 'date' && obj[key] === '') {
                      cleaned[key] = null;
                  } else {
                      cleaned[key] = obj[key];
                  }
              }
          });
          return cleaned;
      };

      // 🌟 1. 單筆資料的圖片上傳
      if (data.image) {
          const uploadedUrl = await uploadImageToSupabase(data.image);
          // 🌟 如果上傳失敗 (回傳 null) 且原本是 base64 (代表是新圖片)，則中斷儲存，避免資料損壞
          if (uploadedUrl === null && data.image.startsWith('data:')) {
              return; 
          }
          data.image = uploadedUrl;
      }

      // 🌟 2. 處理批量新增小卡
      if (type === 'card' && Array.isArray(data)) {
          const processedData = await Promise.all(data.map(async (item) => {
              let imageUrl = item.image;
              if (imageUrl && imageUrl.startsWith('data:')) {
                   const uploaded = await uploadImageToSupabase(imageUrl);
                   imageUrl = uploaded;
              }
              return { ...item, image: imageUrl };
          }));
          
          // 檢查是否有上傳失敗的 (如果是新圖片且變成了 null)
          if (processedData.some(d => d.image === null && d.image !== data.find(x => x.name === d.name)?.image)) {
               alert("部分圖片上傳失敗，已取消批量建立。");
               return;
          }

          const newCards = processedData.map((item, idx) => ({ ...item, id: Date.now().toString() + idx }));
          setCards(prev => [...prev, ...newCards]);
          
          const dbPayloads = newCards.map(c => toSnakeCase(cleanData(c)));
          const { error } = await supabase.from(table).insert(dbPayloads);
          
          if (error) alert("批量儲存失敗: " + error.message);
          return;
      }

      // 🌟 3. 處理單筆新增/編輯
      const payload = { ...data, id: data.id || Date.now().toString() }; // 🌟 復原為純數字字串
      
      const updateList = (list, setList) => {
           setList(prev => {
               const exists = prev.some(item => item.id === payload.id);
               let newList;
               if (exists) {
                   newList = prev.map(item => item.id === payload.id ? payload : item);
               } else {
                   newList = [...prev, payload];
               }
               // 🌟 新增 type 判斷，讓子類也馬上套用新排序
               if (type === 'member' || type === 'type') {
                   newList.sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0));
               }
               return newList;
           });
      };

      if (type === 'card') updateList(cards, setCards);
      else if (type === 'group') { updateList(groups, setGroups); if (!isEdit) setCurrentGroupId(payload.id); }
      else if (type === 'member') updateList(members, setMembers);
      else if (type === 'series') updateList(series, setSeries);
      else if (type === 'batch') updateList(batches, setBatches);
      else if (type === 'channel') updateList(channels, setChannels);
      else if (type === 'type') updateList(types, setTypes);
      else if (type === 'subunit') {
          // 🌟 分隊特殊邏輯：如果是編輯且名稱改變，同步更新成員與系列
          if (isEdit) {
              const oldItem = subunits.find(s => s.id === payload.id);
              if (oldItem && oldItem.name !== payload.name) {
                  // Update members
                  setMembers(prev => prev.map(m => (m.groupId === currentGroupId && m.subunit === oldItem.name) ? { ...m, subunit: payload.name } : m));
                  await supabase.from('members').update({ subunit: payload.name }).eq('group_id', currentGroupId).eq('subunit', oldItem.name);
                  
                  // Update series
                  setSeries(prev => prev.map(s => (s.groupId === currentGroupId && s.subunit === oldItem.name) ? { ...s, subunit: payload.name } : s));
                  await supabase.from('series').update({ subunit: payload.name }).eq('group_id', currentGroupId).eq('subunit', oldItem.name);
              }
          }
          // 🌟 排序
          setSubunits(prev => { const next = prev.filter(s => s.id !== payload.id); return [...next, payload].sort((a, b) => (a.sortOrder || 999) - (b.sortOrder || 999)); });
      }
      
      if (type === 'batch' && isEdit) {
          const updatedCards = cards.map(c => {
              if (c.batchId === payload.id) {
                  return { ...c, seriesId: payload.seriesId !== undefined ? payload.seriesId : c.seriesId, channel: payload.channel !== undefined ? payload.channel : c.channel, type: payload.type !== undefined ? payload.type : c.type };
              }
              return c;
          });
          setCards(updatedCards);
          
          const cardPayload = {};
          if (payload.seriesId !== undefined) cardPayload.series_id = payload.seriesId;
          if (payload.channel !== undefined) cardPayload.channel = payload.channel;
          if (payload.type !== undefined) cardPayload.type = payload.type;
          
          if (Object.keys(cardPayload).length > 0) {
              supabase.from('ui_cards').update(cardPayload).eq('batch_id', payload.id).then();
          }
      }

      const dbPayload = toSnakeCase(cleanData(payload));
      const { error } = await supabase.from(table).upsert(dbPayload);
      
      if (error) {
          console.error("資料庫儲存失敗:", error.message, dbPayload);
          if (error.message.includes("row-level security")) {
              alert(`儲存失敗：資料庫權限不足 (RLS)。\n請確認您已為 ${table} 資料表設定 RLS 政策。\n\n若為測試環境，可至 Supabase SQL Editor 執行：\ncreate policy "Enable all" on "${table}" for all using (true) with check (true);`);
          } else {
              alert(`儲存失敗: ${error.message}`);
          }
      }
  };

  // 🌟 通用刪除功能
  const handleDeleteData = async (type, id) => {
      const tableMap = { group: 'groups', member: 'members', series: 'series', batch: 'batches', channel: 'channels', type: 'types', card: 'ui_cards', subunit: 'ui_subunits' };
      
      if (type === 'card') {
          setCards(prev => prev.filter(c => c.id !== id));
          setInventory(prev => prev.filter(i => i.cardId !== id));
          setCustomLists(prev => prev.map(l => ({ ...l, items: l.items.filter(i => i.cardId !== id) })));
          setBulkRecords(prev => prev.map(r => ({ ...r, items: (r.items || []).filter(i => i.cardId !== id) })));
      } else if (type === 'series') {
          setSeries(prev => prev.filter(s => s.id !== id));
          setCards(prev => prev.map(c => c.seriesId === id ? { ...c, seriesId: null } : c));
          setBatches(prev => prev.filter(b => b.seriesId !== id));
      } else if (type === 'batch') {
          setBatches(prev => prev.filter(b => b.id !== id));
          setCards(prev => prev.map(c => c.batchId === id ? { ...c, batchId: null } : c));
      } else if (type === 'group') {
          if (currentGroupId === id) {
              const remaining = groups.filter(g => g.id !== id);
              setCurrentGroupId(remaining.length > 0 ? remaining[0].id : null);
          }
          setGroups(prev => prev.filter(g => g.id !== id));
      } else if (type === 'member') {
          setMembers(prev => prev.filter(m => m.id !== id));
          setCards(prev => prev.map(c => c.memberId === id ? { ...c, memberId: null } : c));
      } else if (type === 'channel') {
          setChannels(prev => prev.filter(c => c.id !== id));
          setCards(prev => prev.map(c => c.channel === id ? { ...c, channel: null } : c));
          setBatches(prev => prev.map(b => b.channel === id ? { ...b, channel: null } : b));
      } else if (type === 'type') {
          setTypes(prev => prev.filter(t => t.id !== id));
          setCards(prev => prev.map(c => c.type === id ? { ...c, type: null } : c));
          setBatches(prev => prev.map(b => b.type === id ? { ...b, type: null } : b));
      } else if (type === 'subunit') {
          const item = subunits.find(s => s.id === id);
          if (item) {
              // Clear subunit from members and series
              setMembers(prev => prev.map(m => (m.groupId === currentGroupId && m.subunit === item.name) ? { ...m, subunit: null } : m));
              setSeries(prev => prev.map(s => (s.groupId === currentGroupId && s.subunit === item.name) ? { ...s, subunit: null } : s));
              await supabase.from('members').update({ subunit: null }).eq('group_id', currentGroupId).eq('subunit', item.name);
              await supabase.from('series').update({ subunit: null }).eq('group_id', currentGroupId).eq('subunit', item.name);
          }
          setSubunits(prev => prev.filter(s => s.id !== id));
      }

      await supabase.from(tableMap[type]).delete().eq('id', id);
  };

  // 🌟 資料同步功能 (Crawler)
  const fetchCardData = async () => {
    if (!confirm('確定要執行資料同步嗎？這將會呼叫後端爬蟲 API。')) return;

    try {
        // 呼叫自己的 Vercel 伺服器，由伺服器代為抓取，徹底避開 CORS 限制
        const response = await fetch('/api/crawler?planets=cravity');
        
        if (!response.ok) {
            throw new Error('伺服器代理請求失敗');
        }

        const data = await response.json();
        console.log("成功抓取到資料：", data);
        alert(`同步完成！請點擊確定以重新整理網頁載入最新卡片。`);
        
        // 🌟 自動重新載入頁面，讓最新的資料能立刻顯示在畫面上
        window.location.reload();
        
    } catch (error) {
        console.error("抓取失敗：", error);
        alert("抓取失敗，請檢查 Console");
    }
  };

  // 🌟 批量入庫
  const handleBulkOwn = async (items) => {
      // 確保每一筆資料都有獨立的 ID 與預設數量 1
      const newRecords = items.map((item, idx) => ({
          ...item,
          id: item.id || `inv_${Date.now()}_${idx}`, // 使用傳遞過來的獨立 ID，如果沒有才自動生成
          quantity: 1
      }));
      
      // 更新前端畫面
      setInventory([...(inventory || []), ...newRecords]);
      
      // 🌟 清空新版的選取大腦
      setSelectedItems([]); 
      setIsSelectionMode(false);
      closeModal();
      
      // 寫入資料庫
      const { error } = await supabase.from('ui_inventory').insert(newRecords.map(toSnakeCase));
      
      if (error) {
          console.error("入庫失敗:", error);
          alert("入庫時發生錯誤，請看控制台");
      } else {
          alert(`已成功入庫 ${newRecords.length} 張卡片！`);
      }
  };

  // 🌟 批量歸類
  const handleBatchCategorize = async () => {
      if (!batchCategorizeTarget) return;
      const { type, value } = batchCategorizeTarget;
      
      // 🌟 確保所有 ID 比對都是嚴格字串，避免型別不一致導致判定失敗
      const uniqueSelectedCardIds = [...new Set(selectedItems.map(item => String(item.cardId)))];
      const uniqueSelectedBatchIds = [...new Set((selectedBatches || []).map(id => String(id)))];
      
      const cardsToUpdateDb = [];
      const batchesToUpdateDb = [];
      
      let nextCards = [...(cards || [])];
      let nextBatches = [...(batches || [])];

      // 1. 若歸類目標為「系列」，處理批次的加入與移除
      if (type === 'seriesId') {
          nextBatches = nextBatches.map(b => {
              const isSelected = uniqueSelectedBatchIds.includes(String(b.id));
              const wasInSeries = String(b.seriesId) === String(value);
              
              if (isSelected && !wasInSeries) {
                  const newBatch = { ...b, seriesId: value };
                  batchesToUpdateDb.push(newBatch);
                  return newBatch;
              } else if (!isSelected && wasInSeries) {
                  const newBatch = { ...b, seriesId: '' }; // 移出該歸類
                  batchesToUpdateDb.push(newBatch);
                  return newBatch;
              }
              return b;
          });
          
          nextCards = nextCards.map(c => {
              if (c.batchId) {
                  const isSelectedBatch = uniqueSelectedBatchIds.includes(String(c.batchId));
                  const wasSelectedBatch = batches.find(b => String(b.id) === String(c.batchId))?.seriesId === value;

                  if (isSelectedBatch && String(c.seriesId) !== String(value)) {
                      const newCard = { ...c, seriesId: value };
                      cardsToUpdateDb.push(newCard);
                      return newCard;
                  } else if (!isSelectedBatch && wasSelectedBatch && String(c.seriesId) === String(value)) {
                      const newCard = { ...c, seriesId: '' };
                      cardsToUpdateDb.push(newCard);
                      return newCard;
                  }
              }
              return c;
          });
      }

      // 2. 處理獨立選取的「卡片」的加入與移除
      nextCards = nextCards.map(c => {
          // 如果卡片屬於某個剛被操作的批次，就不重複處理，交給上面的批次邏輯
          if (type === 'seriesId' && c.batchId) {
              const batchInTarget = nextBatches.find(b => String(b.id) === String(c.batchId))?.seriesId === value;
              const batchWasInTarget = batches.find(b => String(b.id) === String(c.batchId))?.seriesId === value;
              if (batchInTarget || batchWasInTarget) return c; 
          }

          const isSelected = uniqueSelectedCardIds.includes(String(c.id));
          
          const wasInBatch = (() => {
              let baseMatch = false;
              if (type === 'type' || type === 'channel') {
                  const arr = type === 'type' ? types : channels;
                  const obj = (arr || []).find(x => String(x.id) === String(value));
                  baseMatch = String(c[type]) === String(value) || (obj && String(c[type]) === String(obj.name));
              } else {
                  baseMatch = String(c[type]) === String(value);
              }
              return baseMatch && (!categorizeSubBatchId || String(c.batchId) === String(categorizeSubBatchId));
          })();
          
          if (isSelected && !wasInBatch) {
              const newCard = { ...c, [type]: value };
              if (type === 'seriesId' && categorizeSubBatchId) {
                  newCard.batchId = categorizeSubBatchId;
                  const targetBatch = nextBatches.find(b => String(b.id) === String(categorizeSubBatchId));
                  if (targetBatch) {
                      if (targetBatch.channel) newCard.channel = targetBatch.channel;
                      if (targetBatch.type) newCard.type = targetBatch.type;
                  }
              } else if (type === 'batchId' && value) {
                  const targetBatch = nextBatches.find(b => String(b.id) === String(value));
                  if (targetBatch) {
                      if (targetBatch.seriesId) newCard.seriesId = targetBatch.seriesId;
                      if (targetBatch.channel) newCard.channel = targetBatch.channel;
                      if (targetBatch.type) newCard.type = targetBatch.type;
                  }
              }
              const existingIdx = cardsToUpdateDb.findIndex(cu => String(cu.id) === String(newCard.id));
              if (existingIdx !== -1) cardsToUpdateDb[existingIdx] = newCard;
              else cardsToUpdateDb.push(newCard);
              return newCard;
          } else if (!isSelected && wasInBatch) {
              const newCard = { ...c, [type]: '' };
              if (type === 'seriesId') {
                  newCard.batchId = ''; // 移出系列時，連同批次一併清空
              }
              const existingIdx = cardsToUpdateDb.findIndex(cu => String(cu.id) === String(newCard.id));
              if (existingIdx !== -1) cardsToUpdateDb[existingIdx] = newCard;
              else cardsToUpdateDb.push(newCard);
              return newCard;
          }
          return c;
      });
      
      setCards(nextCards);
      setBatches(nextBatches);
      
      // 3. 寫入資料庫
      for(const b of batchesToUpdateDb) {
          await supabase.from('batches').update({ series_id: b.seriesId }).eq('id', b.id);
      }
      
      for(const c of cardsToUpdateDb) {
          const payload = {
              series_id: c.seriesId || null,
              batch_id: c.batchId || null,
              channel: c.channel || null,
              type: c.type || null,
              member_id: c.memberId || null
          };
          await supabase.from('ui_cards').update(payload).eq('id', c.id);
      }

      // 🌟 改為清空 selectedItems
      setSelectedItems([]);
      setSelectedBatches([]);
      setBatchCategorizeTarget(null);
      setCategorizeSubBatchId('');
      setIsSelectionMode(false);
      alert("歸類更新完成！");
  };
  
  // 🌟 儲存盤收紀錄
  // 🌟 儲存盤收紀錄 (支援重複卡片與獨立售價)
  const handleSaveBulkRecord = async (data) => {
      let savedRecordId;
      const dataToSave = { ...data, groupId: data.groupId || currentGroupId };

      if (dataToSave.image && !dataToSave.image.startsWith('http')) {
          const uploaded = await uploadImageToSupabase(dataToSave.image);
          if (uploaded === null) return; // Stop if upload failed
          dataToSave.image = uploaded;
      }

      const isExisting = (bulkRecords || []).some(r => String(r.id) === String(dataToSave.id));

      if (isExisting) {
          setBulkRecords(prev => prev.map(r => (r.id === dataToSave.id ? { ...r, ...dataToSave } : r)));
          savedRecordId = dataToSave.id;
          setEditingBulkRecord(prev => ({ ...prev, ...dataToSave }));
      } else {
          const newRecord = { ...dataToSave, id: dataToSave.id || Date.now().toString() };
          setBulkRecords(prev => [...(prev || []), newRecord]);
          savedRecordId = newRecord.id;
          setEditingBulkRecord(newRecord);
      }

      let availableInv = [...(inventory || []).filter(i => i.bulkRecordId === savedRecordId)];

      // 🌟 過濾雜物，並精準對應每一張獨立卡片的庫存 ID 與售價
      // 🌟 修正：同時處理卡片 (!isMisc && !isAlbum) 與 專輯 (isAlbum)
      const newBulkInvItems = (dataToSave.items || []).filter(item => !item.isMisc).map((item, idx) => {
          let invIdx = -1;
          if (item.isAlbum) {
              // 專輯對應邏輯：找同 bulkRecordId 且有 albumId 的項目
              invIdx = availableInv.findIndex(i => String(i.id) === String(item.id) || (String(i.albumId) === String(item.albumId) && i.albumStatus === item.albumStatus));
          } else {
              // 卡片對應邏輯
              invIdx = availableInv.findIndex(i => String(i.id) === String(item.id) || String(i.cardId) === String(item.cardId));
          }
          
          let existing = null;
          if (invIdx !== -1) {
              existing = availableInv[invIdx];
              availableInv.splice(invIdx, 1);
          }

          let nextNote = existing?.note || `來自盤收: ${dataToSave.name}`;
          if (nextNote.startsWith('來自盤收:')) nextNote = `來自盤收: ${dataToSave.name}`;

          // 🌟 致命修復：確保庫存 ID 絕對不包含 temp_，強制產生標準的資料庫可用 ID，避免資料庫拒絕或丟失
          let finalId = item.id;
          if (!finalId || String(finalId).startsWith('temp_') || String(finalId).startsWith('sel_') || String(finalId).startsWith('album_')) {
              finalId = existing?.id || `bulk_inv_${savedRecordId}_${idx}_${Math.random().toString(36).substring(2, 9)}`;
          }
          
          // 🌟 2. 致命修復：把更新後的真實 ID 寫回 dataToSave.items，確保資料庫與前端的庫存關聯完美吻合
          item.id = finalId;

          return {
              id: finalId,
              cardId: item.isAlbum ? null : item.cardId, // 🌟 專輯沒有 cardId
              bulkRecordId: savedRecordId,
              buyDate: dataToSave.buyDate,
              buyPrice: item.buyPrice,
              quantity: item.isAlbum ? 0 : 1, // 🌟 專輯不計入卡片數量，但計入庫存項目
              source: dataToSave.source,
              status: dataToSave.status,
              sellPrice: item.sellPrice !== undefined ? (item.sellPrice === '' ? 0 : Number(item.sellPrice)) : (existing?.sellPrice || 0),
              sellDate: item.sellDate !== undefined ? item.sellDate : (existing?.sellDate || ''), // 🌟 優先使用表單傳來的日期
              condition: existing?.condition || '無損',
              note: nextNote,
              albumId: item.albumId || null,
              albumStatus: item.albumStatus || '未拆',
              albumQuantity: Number(item.albumQuantity) || 0
          };
      });

      // 🌟 1. 精準寫入本地狀態：如果存在就更新，不存在就新增，絕對不會丟失全新建立的資料
      // 🌟 核心修復：確保寫入前，dataToSave.items 已經獲得了正確的 finalId，避免 UI 關聯脫鉤
      setBulkRecords(prev => {
          if (prev.some(r => String(r.id) === String(savedRecordId))) {
              return prev.map(r => String(r.id) === String(savedRecordId) ? { ...r, ...dataToSave } : r);
          } else {
              return [...prev, dataToSave];
          }
      });
      setEditingBulkRecord(prev => prev ? { ...prev, ...dataToSave } : prev);

      setInventory(prevInv => [...prevInv.filter(i => String(i.bulkRecordId) !== String(savedRecordId)), ...newBulkInvItems]);
      
      await supabase.from('bulk_records').upsert(toSnakeCase(dataToSave));
      
      const finalIds = newBulkInvItems.map(i => i.id);
      
      // 🌟 終極修復：先撈取資料庫既有 ID，比對後精準刪除，避免 .not('in') 字串陣列語法錯誤導致儲存中斷
      const res = await fetch(`/api/data?table=ui_inventory&filterColumn=bulk_record_id&filterValue=${savedRecordId}`);
      const result = await res.json();
      const existingInv = result.data;
      if (existingInv) {
          const idsToDelete = existingInv.map(i => i.id).filter(id => !finalIds.includes(id));
          if (idsToDelete.length > 0) {
              await supabase.from('ui_inventory').delete().in('id', idsToDelete);
          }
      } else if (finalIds.length === 0) {
          // 如果完全沒有卡片，保險起見直接清空該盤收的庫存
          await supabase.from('ui_inventory').delete().eq('bulk_record_id', savedRecordId);
      }
      
      if (newBulkInvItems.length > 0) {
          await supabase.from('ui_inventory').upsert(newBulkInvItems.map(toSnakeCase));
      }
  };

  const handleDeleteBulkRecord = async (id) => {
      // 1. 更新前端畫面狀態，立刻隱藏
      setBulkRecords(prev => prev.filter(r => r.id !== id));
      setInventory(prev => prev.filter(i => i.bulkRecordId !== id));
      setEditingBulkRecord(null);
      
      // 2. 同步刪除資料庫資料 (先刪除盤收內的所有小卡紀錄，再刪除盤收本身)
      await supabase.from('ui_inventory').delete().eq('bulk_record_id', id);
      await supabase.from('bulk_records').delete().eq('id', id);
  };

  const renderContent = () => {
    const groupCardIds = new Set((cards || []).filter(c => c.groupId === currentGroupId).map(c => c.id));
    const groupInventory = (inventory || []).filter(inv => groupCardIds.has(inv.cardId));

    if (groups.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] text-center">
                <Users className="w-16 h-16 text-gray-300 mb-4" />
                <h2 className="text-xl font-bold text-gray-700 mb-2">歡迎使用小卡管家！</h2>
                <p className="text-gray-500 mb-6">點擊下方按鈕，建立你的第一個團體開始管理吧。</p>
                <button onClick={() => openModal('group')} className="bg-indigo-600 text-white px-6 py-3 rounded-full font-bold shadow-lg hover:bg-indigo-700">
                    + 新增團體
                </button>
            </div>
        );
    }

    switch(activeTab) {
      case 'library': 
        return <LibraryTab 
          cards={currentCards} 
          currentGroupId={currentGroupId}
          members={currentMembers} setMembers={setMembers}
          series={currentSeries} 
          batches={currentBatches}
          channels={currentChannels}
          types={currentTypes}
          setViewingCard={setViewingCard}
          inventory={currentInventory}
          sales={currentSales}
          openModal={openModal}
          uniqueTypes={uniqueTypes}
          combinedTypes={combinedTypes}
          combinedChannels={combinedChannels}
          uniqueSeriesTypes={uniqueSeriesTypes}
          
          isSelectionMode={isSelectionMode}
          setIsSelectionMode={setIsSelectionMode}
          selectedItems={selectedItems}
          setSelectedItems={setSelectedItems}
          selectedBatches={selectedBatches}
          setSelectedBatches={setSelectedBatches}
          batchCategorizeTarget={batchCategorizeTarget}
          setBatchCategorizeTarget={setBatchCategorizeTarget}
          
          allCards={currentCards}
          setGroups={setGroups}
          setSeries={setSeries}
          setBatches={setBatches}
          setCards={setCards}
          cols={libraryCols}           // 🌟 修正：對應 libraryCols
          setCols={setLibraryCols}     // 🌟 修正：對應 setLibraryCols
          subunits={currentSubunits}   // 🌟 傳入 subunits
          setSubunits={setSubunits}    // 🌟 傳入 setSubunits
        />;
      case 'collection': 
        return <CollectionTab 
          currentGroupId={currentGroupId}
          cards={currentCards} inventory={currentInventory} setViewingCard={setViewingCard} 
          members={currentMembers} series={currentSeries} batches={currentBatches} channels={currentChannels} 
          types={currentTypes} sales={currentSales} 
          cols={collectionCols}       // 🌟 致命錯誤修正：把 cols 換成 collectionCols
          setCols={setCollectionCols} // 🌟 致命錯誤修正：把 setCols 換成 setCollectionCols
          subunits={currentSubunits}
          customLists={customLists}
        />;
      case 'bulk':
        return <BulkTab 
            cards={currentCards}
            records={currentBulkRecords} 
            allRecords={currentBulkRecords}
            onAdd={() => setEditingBulkRecord('new')} 
            onEdit={(record) => setEditingBulkRecord(record)} 
            onAddSet={(batch, batchCards) => {
                setEditingBulkRecord({
                    isSetMode: true,
                    name: `${batch.name} 套收`,
                    image: batch.image,
                    items: batchCards.map((c, idx) => ({
                        uid: `temp_${Date.now()}_${idx}`,
                        cardId: c.id,
                        buyPrice: '',
                        sellPrice: '',
                        isSet: true,
                        isManual: false
                    }))
                });
            }}
            inventory={currentInventory}
            series={currentSeries}
            batches={currentBatches}
            setInventory={setInventory}
            setSales={setSales}
            members={currentMembers}
            onViewCard={setViewingCard}
            bulkRecords={currentBulkRecords}
            setBulkRecords={setBulkRecords}
            uniqueSources={uniqueSources}
            onRenameSource={handleRenameSource}
            onDeleteSource={handleDeleteSource}
            onSyncData={fetchCardData}
                subunits={currentSubunits}
                types={currentTypes}
        />;
        case 'inventory': 
        return <InventoryTab 
            cards={currentCards} 
            inventory={currentInventory} 
            setViewingCard={setViewingCard} 
            series={currentSeries} 
            bulkRecords={currentBulkRecords} 
            batches={currentBatches} 
            channels={currentChannels} 
            types={currentTypes} 
            onEditBulkRecord={(record) => setEditingBulkRecord(record)} 
            onDeleteInventory={async (id) => {
                const targetItem = inventory.find(i => i.id === id);
                setInventory(prev => prev.filter(i => i.id !== id));
                await supabase.from('ui_inventory').delete().eq('id', id);

                // 🌟 如果這筆資料來自盤收，同步移除盤收紀錄內的該項目，避免資料不同步
                if (targetItem && targetItem.bulkRecordId) {
                    setBulkRecords(prev => prev.map(record => {
                        if (record.id === targetItem.bulkRecordId) {
                            const newItems = (record.items || []).filter(item => item.id !== id);
                            
                            // 背景同步更新資料庫
                            supabase.from('bulk_records').update({ items: newItems }).eq('id', record.id).then(({ error }) => {
                                if(error) console.error("Error syncing bulk record items:", error);
                            });
                            
                            return { ...record, items: newItems };
                        }
                        return record;
                    }));
                }
            }}
            onDeleteBulkRecord={handleDeleteBulkRecord}
        />;
           case 'export': 
        return <ExportTab 
          currentGroupId={currentGroupId}
              groups={groups}
          cards={currentCards} customLists={customLists} setCustomLists={setCustomLists} 
          setViewingCard={setViewingCard} isExportMode={isExportMode} setIsExportMode={setIsExportMode} 
          sales={currentSales} inventory={currentInventory} members={currentMembers} series={currentSeries} 
          batches={currentBatches} channels={currentChannels} types={currentTypes} 
          cols={exportCols}                     // 🌟 修正：把 cols 換成 exportCols
          setCols={setExportCols}               // 🌟 修正：把 setCols 換成 setExportCols
          showDetails={exportShowDetails}       // 🌟 順手修正：把 showDetails 換成 exportShowDetails
          setShowDetails={setExportShowDetails} // 🌟 順手修正
          subunits={currentSubunits}            // 🌟 傳入 subunits
          appSettings={appSettings}             // 🌟 傳入設定資料
          onUpdateSetting={handleUpdateAppSetting} // 🌟 傳入更新函式
          showPrices={exportShowPrices}         // 🌟 傳入價格顯示狀態
          setShowPrices={setExportShowPrices}
        />;
      default: return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800 font-sans pb-20 md:pb-0">
      <nav className="bg-white/70 backdrop-blur-lg border-b border-white/20 shadow-sm sticky top-0 z-40 px-4">
        <div className="max-w-6xl mx-auto h-16 flex justify-between items-center">
          <Link href="/admin" className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity">
            <div className="bg-indigo-600 p-2 rounded-lg">
              <Grid className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-xl text-indigo-900 hidden sm:block">小卡管家</span>
          </Link>

          {groups.length > 0 && (
            <div className="flex space-x-1 overflow-x-auto no-scrollbar mx-4">
              {[
                { id: 'library', icon: Layers, label: '圖鑑' },
                { id: 'collection', icon:  CheckCircle, label: '收藏' },
                { id: 'bulk', icon: Package, label: '管理' },
                { id: 'inventory', icon: List, label: '紀錄' },
                { id: 'export', icon: Share2, label: '輸出' },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => {
                      setActiveTab(tab.id);
                      setIsSelectionMode(false);
                      setSelectedItems([]);
                      setSelectedBatches([]);
                      setBatchCategorizeTarget(null);
                  }}
                  className={`px-3 py-2 rounded-full text-sm font-bold transition-all whitespace-nowrap flex items-center gap-1 ${
                    activeTab === tab.id 
                      ? 'bg-black text-white shadow-md' 
                      : 'text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  <tab.icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>
          )}

          <div className="relative">
            <div 
                className="flex items-center gap-2 cursor-pointer p-1 rounded-full hover:bg-gray-100 transition-colors"
                onClick={() => setShowGroupSelector(!showGroupSelector)}
                onDoubleClick={(e) => {
                    e.stopPropagation();
                    if(currentGroup) {
                        openModal('group', currentGroup);
                        setShowGroupSelector(false);
                    }
                }}
            >
                {currentGroup ? (
                    <>
                        <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-indigo-600 shadow-md flex items-center justify-center bg-gray-100">
                            {currentGroup.image ? <img src={currentGroup.image} alt={currentGroup.name} className="w-full h-full object-cover" /> : <Users className="w-5 h-5 text-gray-400"/>}
                        </div>
                        <ChevronDown className="w-4 h-4 text-gray-500" />
                    </>
                ) : (
                    <div className="w-10 h-10 rounded-full border-2 border-dashed border-gray-300 flex items-center justify-center bg-gray-50">
                        <Plus className="w-5 h-5 text-gray-400"/>
                    </div>
                )}
            </div>

            {showGroupSelector && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowGroupSelector(false)}></div>
                    <div className="absolute right-0 top-12 w-48 bg-white rounded-xl shadow-xl border border-gray-100 z-50 overflow-hidden animate-fade-in">
                        <div className="p-2 border-b bg-gray-50 text-xs font-bold text-gray-500">切換團體</div>
                        <div className="max-h-60 overflow-y-auto no-scrollbar">
                            {(groups || []).map(g => (
                                <Link 
                                    href={`/?group=${g.id}`}
                                    key={g.id}
                                    onDoubleClick={(e) => { e.preventDefault(); setShowGroupSelector(false); openModal('group', g); }} 
                                    onClick={() => { setCurrentGroupId(g.id); setShowGroupSelector(false); }}
                                    className={`flex items-center gap-3 p-3 hover:bg-gray-50 cursor-pointer ${currentGroupId === g.id ? 'bg-indigo-50 text-indigo-700' : 'text-gray-700'}`}
                                >
                                    <div className="w-8 h-8 rounded-full flex-shrink-0 bg-gray-100 overflow-hidden border">
                                        {g.image ? <img src={g.image} className="w-full h-full object-cover" /> : <Users className="w-4 h-4 m-2 text-gray-400"/>}
                                    </div>
                                    <span className="font-bold text-sm">{g.name}</span>
                                    {currentGroupId === g.id && <Check className="w-4 h-4 ml-auto" />}
                                </Link>
                            ))}
                        </div>
                        <div 
                            onClick={() => { setShowGroupSelector(false); openModal('group'); }}
                            className="p-3 border-t hover:bg-gray-50 cursor-pointer flex items-center gap-2 text-indigo-600 font-bold text-sm"
                        >
                            <Plus className="w-4 h-4" /> 新增團體
                        </div>
                    </div>
                </>
            )}
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto p-4" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        {renderContent()}
      </main>

      {editingBulkRecord && (
          <BulkRecordDetailView 
              record={editingBulkRecord === 'new' ? null : editingBulkRecord}
              onClose={() => setEditingBulkRecord(null)}
              onSave={handleSaveBulkRecord}
              onDelete={handleDeleteBulkRecord}
              cards={currentCards}
              members={currentMembers}
              series={currentSeries}
              batches={currentBatches}
              channels={currentChannels}
              types={currentTypes}
              uniqueTypes={uniqueTypes}
              uniqueChannels={uniqueChannels}
              uniqueSeriesTypes={uniqueSeriesTypes}
              onViewCard={setViewingCard}
              inventory={inventory}
              uniqueSources={uniqueSources}
              onRenameSource={handleRenameSource}
              onDeleteSource={handleDeleteSource}
          subunits={subunits} // 🌟 傳入 subunits
          />
      )}

      {modalState.type && modalState.type !== 'bulkOwn' && (
        <AddDataModal 
          title={modalState.data?.id ? `編輯${getModalTitle(modalState.type)}` : `新增${getModalTitle(modalState.type)}`}
          type={modalState.type}
          initialData={{ groupId: currentGroupId, ...modalState.data }}
          extraOptions={{ 
            members: (members || []).filter(m => String(m.groupId) === String(currentGroupId) && (
                !modalState.data?._filterSubunit || modalState.data._filterSubunit === 'All' || m.subunit === modalState.data._filterSubunit
            )),
            series: (series || []).filter(s => String(s.groupId) === String(currentGroupId) && (
                !modalState.data?._filterSubunit || modalState.data._filterSubunit === 'All' || s.subunit === modalState.data._filterSubunit
            )),
            batches: (batches || []).filter(b => String(b.groupId) === String(currentGroupId)),
            channels: combinedChannels,
            types: combinedTypes,
            seriesTypes: uniqueSeriesTypes
          }}
          onClose={closeModal} 
          onSave={(data) => handleSaveData(data, modalState.type, !!modalState.data?.id)} 
          
          /* 🌟 就是這行！告訴系統複製出來的資料要當作「全新的」存入資料庫 */
          onDuplicate={(data) => handleSaveData(data, modalState.type, false)} 
          
          onDelete={handleDeleteData}
        />
      )}

      {modalState.type === 'bulkOwn' && (
        <BulkOwnModal 
            cards={cards} 
            selectedItems={selectedItems} // 🌟 替換這裡：直接把我們帶有 uid 與重複點擊紀錄的陣列傳進去！
            onClose={closeModal}
            onSave={(items) => {
             // 確保它存檔後會關閉視窗並清空選取
             handleBulkOwn(items); 
            setSelectedItems([]); 
            setIsSelectionMode(false);
            }}
             series={series}
            batches={batches}
            channels={channels}
            types={types}
        />
      )}

      {viewingCard && (
        <CardDetailModal 
          currentGroupId={currentGroupId}
          card={viewingCard} 
          onClose={() => setViewingCard(null)}
          inventory={inventory}
          setInventory={setInventory}
          sales={sales} 
          setSales={setSales} 
          customLists={customLists}
          setCustomLists={setCustomLists}
          groups={groups}
          members={members}
          series={series}
          batches={batches}
          channels={channels}
          types={types}
          setCards={setCards}
          cards={cards}
          onEdit={(currentCard) => {
              setViewingCard(null); 
              openModal('card', currentCard || viewingCard);
          }}
          onOpenBulkRecord={(bulkId) => {
                      const record = (bulkRecords || []).find(r => String(r.id) === String(bulkId));
              if (record) {
                  setEditingBulkRecord(record);
                  setViewingCard(null);
                  setActiveTab('bulk');
                          if (record.groupId && String(record.groupId) !== String(currentGroupId)) {
                      setCurrentGroupId(record.groupId);
                  }
              }
          }}
          uniqueSources={uniqueSources}
          onRenameSource={handleRenameSource}
          onDeleteSource={handleDeleteSource}
          bulkRecords={bulkRecords}
          setBulkRecords={setBulkRecords}
        />
      )}

      {isSelectionMode && (
          <div className="fixed bottom-0 inset-x-0 bg-white border-t p-4 z-50 shadow-[0_-4px_10px_rgba(0,0,0,0.1)] flex items-center justify-between animate-slide-up">
              <div className="font-bold text-gray-700 flex flex-col sm:flex-row sm:items-center gap-2">
                  {batchCategorizeTarget ? (
                      <div className="flex items-center gap-2">
                          <span className="text-indigo-600">歸類至「{batchCategorizeTarget.name}」</span>
                          <span className="text-[10px] text-gray-500 font-normal bg-gray-100 px-1.5 py-0.5 rounded">
                              已選 {selectedItems.length} 卡{selectedBatches?.length > 0 ? `, ${selectedBatches.length} 批次` : ''}
                          </span>
                          {batchCategorizeTarget.type === 'seriesId' && (
                              <select 
                                  className="text-xs border border-gray-300 rounded p-1 outline-none text-gray-600 font-normal"
                                  value={categorizeSubBatchId}
                                  onChange={(e) => setCategorizeSubBatchId(e.target.value)}
                              >
                                  <option value="">(不指定批次)</option>
                                  {(batches || []).filter(b => String(b.seriesId) === String(batchCategorizeTarget.value)).map(b => (
                                      <option key={b.id} value={b.id}>{b.name}</option>
                                  ))}
                              </select>
                          )}
                      </div>
                  ) : (
                      <span>已選 {selectedItems.length} 張卡片{selectedBatches?.length > 0 ? `, ${selectedBatches.length} 批次` : ''}</span>
                  )}
              </div>
              <div className="flex gap-3">
                  <button onClick={() => { setIsSelectionMode(false); setSelectedItems([]); setSelectedBatches([]); setBatchCategorizeTarget(null); }} className="px-4 py-2 rounded-lg bg-gray-100 text-gray-600 font-bold">取消</button>
                  {batchCategorizeTarget ? (
                      <button 
                        onClick={handleBatchCategorize} 
                        className="px-6 py-2 rounded-lg bg-indigo-600 text-white font-bold disabled:opacity-50"
                      >
                          確認歸類
                      </button>
                  ) : (
                      <div className="flex gap-2">
                          <button 
                            onClick={async () => {
                                // 🌟 許願池不需要重複的卡片，這裡自動幫你過濾成唯一的 ID 名單
                                const uniqueIds = [...new Set(selectedItems.map(item => item.cardId))];
                                const updatedCards = (cards || []).map(c => uniqueIds.includes(c.id) ? { ...c, isWishlist: !c.isWishlist } : c);
                                setCards(updatedCards);
                                for(const id of uniqueIds) {
                                    const target = updatedCards.find(uc => uc.id === id);
                                    if(target) await supabase.from('ui_cards').update({ is_wishlist: target.isWishlist }).eq('id', id);
                                }
                                setIsSelectionMode(false);
                                setSelectedItems([]);
                                setSelectedBatches([]);
                                alert("已更新想要狀態");
                            }}
                            disabled={selectedItems.length === 0}
                            className="p-2 rounded-lg bg-pink-100 text-pink-600 disabled:opacity-50"
                          >
                              <Heart className="w-5 h-5 fill-current" />
                          </button>
                          <button 
                            onClick={() => setActiveModal('bulkList')} 
                            disabled={selectedItems.length === 0}
                            className="p-2 rounded-lg bg-gray-100 text-gray-600 disabled:opacity-50"
                          >
                              <FolderPlus className="w-5 h-5" />
                          </button>
                          <button 
                            onClick={() => openModal('bulkOwn')} 
                            disabled={selectedItems.length === 0}
                            className="px-4 py-2 rounded-lg bg-black text-white font-bold disabled:opacity-50 flex items-center gap-2"
                          >
                              <ShoppingBag className="w-4 h-4" /> 擁有
                          </button>
                      </div>
                  )}
              </div>
          </div>
      )}

      {activeModal === 'bulkList' && (
          <Modal title="批量加入收藏冊" onClose={() => setActiveModal(null)} className="max-w-sm">
              <div className="space-y-2">
                  {(customLists || []).filter(l => !String(l.id).startsWith('sys_sort_') && (!l.groupId || String(l.groupId) === String(currentGroupId))).map(list => (
                      <button 
                          key={list.id}
                          onClick={async () => {
                              const note = prompt("批量備註文字 (可留空)");
                              const newItems = [...(list.items || []), ...selectedItems.map(item => ({ cardId: item.cardId, note: note || '' }))];
                              setCustomLists((customLists || []).map(l => l.id === list.id ? { ...l, items: newItems } : l));
                              await supabase.from('custom_lists').update({ items: newItems }).eq('id', list.id);
                              alert("已加入收藏冊");
                              setActiveModal(null);
                              setIsSelectionMode(false);
                              setSelectedItems([]);
                              setSelectedBatches([]);
                          }}
                          className="w-full text-left p-4 text-sm hover:bg-gray-50 rounded-xl border flex justify-between items-center group transition-colors"
                      >
                          <span className="font-bold text-gray-700">{list.title}</span>
                          <Plus className="w-5 h-5 text-gray-300 group-hover:text-indigo-600" />
                      </button>
                  ))}
              </div>
          </Modal>
      )}
    </div>
  );
}