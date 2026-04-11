const fs = require('fs');
const Papa = require('papaparse');

const convert = (csvFile, tableName) => {
    if (!fs.existsSync(csvFile)) {
        console.log(`找不到 ${csvFile}，跳過...`);
        return;
    }
    console.log(`正在轉換 ${csvFile} ...`);
    const fileContent = fs.readFileSync(csvFile, 'utf8');
    
    // 解析 CSV，自動將第一行視為欄位名稱
    const parsed = Papa.parse(fileContent, { header: true, skipEmptyLines: true });

    let sqlFile = '';
    for (const row of parsed.data) {
        // 擷取欄位名稱 (例如 "id", "name", "group_id")
        const columns = Object.keys(row).map(c => `"${c}"`).join(', ');
        
        // 處理數值、布林值與跳脫單引號
        const values = Object.values(row).map(val => {
            if (val === '' || val === null || val === undefined) return 'NULL';
            if (val === 'true' || val === 'TRUE') return 1;   // SQLite 沒有布林值，轉換為 1
            if (val === 'false' || val === 'FALSE') return 0; // 轉換為 0
            
            // 將字串內的單引號跳脫，避免 SQL 語法錯誤
            return `'${String(val).replace(/'/g, "''")}'`;
        }).join(', ');

        sqlFile += `INSERT INTO ${tableName} (${columns}) VALUES (${values});\n`;
    }

    fs.writeFileSync(`${tableName}.sql`, sqlFile);
    console.log(`✅ 成功產生 ${tableName}.sql (共 ${parsed.data.length} 筆資料)`);
};

// 依序讀取您上傳的檔案並轉換
convert('batches.csv', 'batches');
convert('bulk_records.csv', 'bulk_records');
convert('channels.csv', 'channels');
convert('custom_lists.csv', 'custom_lists');
convert('groups.csv', 'groups');
convert('members.csv', 'members');
convert('series.csv', 'series');
convert('types.csv', 'types');
convert('ui_cards.csv', 'ui_cards');
convert('ui_inventory.csv', 'ui_inventory');
convert('ui_sales.csv', 'ui_sales');
convert('ui_subunits.csv', 'ui_subunits');
