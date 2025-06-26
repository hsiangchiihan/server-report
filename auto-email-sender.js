// if (charts.summary) {
//         attachments.push({
//             filename: 'summaryChart.png',
//             content: charts.summary,
//             cid: 'summaryChart'
//         });
//     }// auto-email-sender-with-charts.js - 帶圖表的自動郵件發送系統
// // 使用方法: node auto-email-sender-with-charts.js

const fetch = require('node-fetch');
const nodemailer = require('nodemailer');
const schedule = require('node-schedule');

// const fs = require('fs').promises;
// const { createCanvas } = require('canvas');
const { createCanvas, loadImage, registerFont } = require('canvas');
registerFont('./fonts/NotoSansTC-Regular.ttf', { family: 'Noto Sans TC' });

// const canvas = createCanvas(600, 400);
// const ctx = canvas.getContext('2d');

// ctx.font = '20px "Noto Sans TC"';
// ctx.fillText('中文顯示正常', 100, 100)

const fs = require('fs');
// const out = fs.createWriteStream('./output.png');
// const stream = canvas.createPNGStream();
// stream.pipe(out);


// ===== 🔧 配置設定 (請修改這裡) =====
const CONFIG = {
    // Google Sheets API URL (你的)
    // googleSheetsUrl: "https://script.google.com/macros/s/AKfycbw-QZD3yZbdJWXWGzBe-CKWaK1doLtmGO64zo8sB0bbA0ga9bJaDVmm3mfPNBndq9uV/exec",
    googleSheetsUrl: "https://script.google.com/macros/s/AKfycbw-QZD3yZbdJWXWGzBe-CKWaK1doLtmGO64zo8sB0bbA0ga9bJaDVmm3mfPNBndq9uV/exec",
    // Gmail 設定 (需要修改)
    gmail: {
        user: 'sealsemailhelper@gmail.com',  // 👈 改成你的 Gmail
        pass: 'zzpm bgib bnis nvbn'      // 👈 改成你的應用程式密碼 (16位數)
    },

    // 收件人設定 (需要修改)
    recipients: [
        // {
        //     email: 'truthmiles@gmail.com',  // 👈 改成實際收件人
        //     time: '07:40',                  // 台灣時間
        //     name: '管理員'
        // },
        // {
        //     email: 'recipient2@gmail.com',  // 👈 可以添加更多收件人
        //     time: '18:00',
        //     name: '主管'
        // }
    ],

    // 圖表設定
    charts: {
        width: 800,
        height: 400,
        backgroundColor: '#ffffff',
        titleFontSize: 16,
        labelFontSize: 12
    },

    // 其他設定
    timezone: 'Asia/Taipei',
    logFile: './email-logs.json'
};

// ===== 📅 時間處理函數 =====

// 獲取台灣當前日期 (YYYY-MM-DD)
function getTaiwanToday() {
    const now = new Date();
    const taiwanTime = new Date(now.toLocaleString("en-US", { timeZone: CONFIG.timezone }));

    const yyyy = taiwanTime.getFullYear();
    const mm = String(taiwanTime.getMonth() + 1).padStart(2, '0');
    const dd = String(taiwanTime.getDate()).padStart(2, '0');

    return `${yyyy}-${mm}-${dd}`;
}

// 獲取台灣當前時間 (HH:MM)
function getTaiwanTime() {
    const now = new Date();
    const taiwanTime = new Date(now.toLocaleString("en-US", { timeZone: CONFIG.timezone }));
    return taiwanTime.toTimeString().split(' ')[0].substring(0, 5);
}

// 檢查是否為台灣的今天
function isTaiwanToday(dateString) {
    return dateString === getTaiwanToday();
}

// ===== 📊 數據獲取函數 =====

// 從 Google Sheets 獲取遊戲數據
async function fetchGameData(date = null) {
    try {
        let targetDate = date || getTaiwanToday();

        // targetDate = "2025-06-02";//強制使用
        console.log(`📊 獲取 ${targetDate} 的遊戲數據...`);

        const response = await fetch(`${CONFIG.googleSheetsUrl}?action=getDateData&date=${targetDate}`);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const result = await response.json();

        if (result.error) {
            console.log(`⚠️ API 錯誤: ${result.error}`);

            // 如果有可用日期，嘗試獲取最近的數據
            if (result.availableDates && result.availableDates.length > 0) {
                console.log(`📅 可用日期: ${result.availableDates.slice(0, 3).join(', ')}`);

                // 嘗試最近的日期
                const latestDate = result.availableDates.sort().reverse()[0];
                if (latestDate !== targetDate) {
                    console.log(`🔄 嘗試獲取 ${latestDate} 的數據...`);
                    return await fetchGameData(latestDate);
                }
            }

            throw new Error(result.error);
        }

        if (!result.data || result.data.length === 0) {
            console.log(`📭 ${targetDate} 沒有遊戲數據`);
            return {
                totalGames: 0,
                totalCleared: 0,
                clearRate: 0,
                totalPlayTime: 0,
                levelStats: {
                    '1': { cleared: 0, total: 0, rate: 0 },
                    '2': { cleared: 0, total: 0, rate: 0 }
                },
                itemStats: { '血量': 0, '時間': 0, '速度': 0, '復活': 0 },
                hourlyPlayTime: {},
                dailyCoins: 0,
                averageSteps: 0,
                averageDamage: 0,
                date: targetDate,
                message: result.message || '無數據',
                isEmpty: true
            };
        }

        // 分析數據
        const analyzed = analyzeGameData(result.data);
        analyzed.date = targetDate;
        analyzed.count = result.data.length;
        analyzed.message = result.message;
        analyzed.isEmpty = false;

        console.log(`✅ 成功獲取 ${targetDate} 數據: ${analyzed.totalGames} 場遊戲，通關率 ${analyzed.clearRate}%`);
        return analyzed;

    } catch (error) {
        console.error(`❌ 獲取數據失敗: ${error.message}`);

        // 返回空數據結構，但標記為錯誤
        const targetDate = date || getTaiwanToday();
        return {
            totalGames: 0,
            totalCleared: 0,
            clearRate: 0,
            totalPlayTime: 0,
            levelStats: { '1': { cleared: 0, total: 0, rate: 0 }, '2': { cleared: 0, total: 0, rate: 0 } },
            levelAverageTimes: {}, // 平均耗時數據
            levelAverageSteps: {}, // 平均步數數據
            levelAverageDamage: {}, // 平均扣血量數據
            itemStats: { '血量': 0, '時間': 0, '速度': 0, '復活': 0 },
            hourlyPlayTime: {},
            dailyCoins: 0,
            averageSteps: 0,
            averageDamage: 0,
            date: targetDate,
            error: error.message,
            isEmpty: true
        };
    }
}

// 獲取 Google Sheets 中所有可用的日期
async function fetchAvailableDates() {
    try {
        console.log('📅 正在獲取 Google Sheets 中的可用日期...');

        const response = await fetch(`${CONFIG.googleSheetsUrl}?action=getAvailableDates`);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const result = await response.json();

        if (result.error) {
            console.log(`⚠️ 獲取可用日期失敗: ${result.error}`);
            return [];
        }

        const availableDates = result.availableDates || [];
        console.log(`✅ 找到 ${availableDates.length} 個有數據的日期: ${availableDates.slice(0, 5).join(', ')}${availableDates.length > 5 ? '...' : ''}`);

        return availableDates.sort().reverse(); // 按日期倒序排列，最新的在前面

    } catch (error) {
        console.error(`❌ 獲取可用日期失敗: ${error.message}`);
        return [];
    }
}

// 獲取歷史數據用於趨勢圖表 (使用實際存在的日期)
async function fetchHistoricalDataFromSheets(maxDays = 7) {
    try {
        // 先獲取所有可用的日期
        const availableDates = await fetchAvailableDates();

        if (availableDates.length === 0) {
            console.log('📭 Google Sheets 中沒有可用的歷史數據');
            return [];
        }

        // 取最近的幾天數據 (最多 maxDays 天)
        const datesToFetch = availableDates.slice(0, maxDays);
        console.log(`📊 將獲取以下日期的數據: ${datesToFetch.join(', ')}`);

        const historicalData = [];

        for (const dateString of datesToFetch) {
            try {
                console.log(`📅 正在獲取 ${dateString} 的數據...`);
                const data = await fetchGameData(dateString);

                historicalData.push({
                    date: dateString,
                    ...data
                });

                console.log(`✅ ${dateString}: ${data.totalGames} 場遊戲，通關率 ${data.clearRate}%`);

                // 避免API請求過於頻繁
                await new Promise(resolve => setTimeout(resolve, 300));

            } catch (error) {
                console.log(`⚠️ 無法獲取 ${dateString} 的詳細數據: ${error.message}`);
            }
        }

        // 按日期正序排列 (圖表需要時間順序)
        historicalData.sort((a, b) => new Date(a.date) - new Date(b.date));

        console.log(`📊 歷史數據獲取完成，共 ${historicalData.length} 天的數據`);
        return historicalData;

    } catch (error) {
        console.error(`❌ 獲取歷史數據失敗: ${error.message}`);
        return [];
    }
}

// 分析遊戲數據
// function analyzeGameData(data) {
//     console.log(`🔍 開始分析遊戲數據，共 ${data.length} 筆記錄`);

//     const levelStats = {};
//     const levelTimes = {}; // 記錄各關卡的耗時數據
//     const levelSteps = {}; // 記錄各關卡的步數數據
//     const levelDamage = {}; // 記錄各關卡的扣血量數據
//     const itemStats = { '血量': 0, '時間': 0, '速度': 0, '復活': 0 };
//     const hourlyPlayTime = {};
//     let totalPlayTimeSeconds = 0;
//     let totalSteps = 0;
//     let totalDamage = 0;
//     let totalCoins = 0;
//     let gamesWithSteps = 0;
//     let gamesWithDamage = 0;

//     // 先打印前幾筆數據來檢查格式
//     if (data.length > 0) {
//         console.log('📋 數據樣本:', JSON.stringify(data[0], null, 2));
//     }

//     for (const row of data) {
//         const level = row.level || "1";
//         const cleared = row.isCleared === "TRUE" || row.isCleared === "true" || row.isCleared === true;

//         // 關卡統計
//         levelStats[level] = levelStats[level] || { total: 0, cleared: 0 };
//         levelStats[level].total++;
//         if (cleared) levelStats[level].cleared++;

//         // 關卡耗時統計 - 只統計通關的記錄
//         if (cleared && row.playTime) {
//             if (!levelTimes[level]) {
//                 levelTimes[level] = { totalSeconds: 0, count: 0 };
//             }

//             const seconds = parsePlayTime(row.playTime);
//             if (seconds > 0) {
//                 levelTimes[level].totalSeconds += seconds;
//                 levelTimes[level].count++;
//                 console.log(`⏱️ 關卡 ${level} 耗時: ${row.playTime} -> ${seconds}秒`);
//             }
//         }

//         // 關卡步數統計 - 統計所有記錄
//         if (row.stepCount && !isNaN(parseInt(row.stepCount))) {
//             if (!levelSteps[level]) {
//                 levelSteps[level] = { totalSteps: 0, count: 0 };
//             }

//             const steps = parseInt(row.stepCount);
//             levelSteps[level].totalSteps += steps;
//             levelSteps[level].count++;
//             console.log(`👣 關卡 ${level} 步數: ${steps}`);
//         }

//         // 關卡扣血量統計 - 統計所有記錄
//         if (row.damageTaken && !isNaN(parseInt(row.damageTaken))) {
//             if (!levelDamage[level]) {
//                 levelDamage[level] = { totalDamage: 0, count: 0 };
//             }

//             const damage = parseInt(row.damageTaken);
//             levelDamage[level].totalDamage += damage;
//             levelDamage[level].count++;
//             console.log(`💔 關卡 ${level} 扣血: ${damage}`);
//         }

//         // 商品統計
//         if (row.itemsBought && row.itemsBought !== "None") {
//             console.log(`🛒 商品購買: ${row.itemsBought}`);
//             row.itemsBought.split(",").forEach(entry => {
//                 const [item, count] = entry.trim().split(":");
//                 if (item && count) {
//                     const itemNameMap = {
//                         'life': '血量',
//                         'clock': '時間',
//                         'speed': '速度',
//                         'revive': '復活'
//                     };
//                     const displayName = itemNameMap[item.toLowerCase()] || item;
//                     if (itemStats[displayName] !== undefined) {
//                         itemStats[displayName] += parseInt(count || 0);
//                     }
//                 }
//             });
//         }

//         // 遊玩時間分析
//         if (row.playTime) {
//             console.log(`🎮 處理遊玩時間: "${row.playTime}"`);
//             const seconds = parsePlayTime(row.playTime);
//             totalPlayTimeSeconds += seconds;
//             console.log(`📊 累計遊玩時間: +${seconds}秒, 總計: ${totalPlayTimeSeconds}秒`);

//             // 按小時統計遊玩時間
//             if (row.timestamp) {
//                 try {
//                     const hour = new Date(row.timestamp).getHours();
//                     hourlyPlayTime[hour] = (hourlyPlayTime[hour] || 0) + seconds / 60;
//                 } catch (e) {
//                     // 時間戳解析失敗，忽略
//                 }
//             }
//         } else {
//             console.log(`⚠️ 該記錄沒有 playTime 欄位`);
//         }

//         // 步數統計
//         if (row.stepCount && !isNaN(parseInt(row.stepCount))) {
//             totalSteps += parseInt(row.stepCount);
//             gamesWithSteps++;
//         }

//         // 扣血量統計
//         if (row.damageTaken && !isNaN(parseInt(row.damageTaken))) {
//             totalDamage += parseInt(row.damageTaken);
//             gamesWithDamage++;
//         }

//         // 金幣統計
//         if (row.coins && !isNaN(parseInt(row.coins))) {
//             totalCoins += parseInt(row.coins);
//         }
//     }

//     // 計算通關率
//     Object.keys(levelStats).forEach(level => {
//         const stats = levelStats[level];
//         stats.rate = stats.total > 0 ? ((stats.cleared / stats.total) * 100).toFixed(1) : 0;
//     });

//     // 計算各關卡平均耗時（分鐘）
//     const levelAverageTimes = {};
//     Object.keys(levelTimes).forEach(level => {
//         const timeData = levelTimes[level];
//         if (timeData.count > 0) {
//             levelAverageTimes[level] = timeData.totalSeconds / timeData.count / 60; // 轉換為分鐘
//         }
//     });

//     // 計算各關卡平均步數
//     const levelAverageSteps = {};
//     Object.keys(levelSteps).forEach(level => {
//         const stepData = levelSteps[level];
//         if (stepData.count > 0) {
//             levelAverageSteps[level] = stepData.totalSteps / stepData.count;
//         }
//     });

//     // 計算各關卡平均扣血量
//     const levelAverageDamage = {};
//     Object.keys(levelDamage).forEach(level => {
//         const damageData = levelDamage[level];
//         if (damageData.count > 0) {
//             levelAverageDamage[level] = damageData.totalDamage / damageData.count;
//         }
//     });

//     const totalGames = data.length;
//     const totalCleared = data.filter(row =>
//         row.isCleared === "TRUE" || row.isCleared === "true" || row.isCleared === true
//     ).length;





//     const result = {
//         totalGames,
//         totalCleared,
//         clearRate: totalGames > 0 ? ((totalCleared / totalGames) * 100).toFixed(1) : 0,
//         totalPlayTime: Math.round(totalPlayTimeSeconds / 60),
//         levelStats,
//         levelAverageTimes, // 各關卡平均耗時
//         levelAverageSteps, // 各關卡平均步數
//         levelAverageDamage, // 各關卡平均扣血量
//         itemStats,
//         hourlyPlayTime,
//         dailyCoins: totalCoins,
//         averageSteps: gamesWithSteps > 0 ? Math.round(totalSteps / gamesWithSteps) : 0,
//         averageDamage: gamesWithDamage > 0 ? Math.round(totalDamage / gamesWithDamage) : 0
//     };


//     // 金幣統計
//     let totalCoinsEarned = 0;
//     let totalCoinsSpent = 0;

//     const itemCosts = { 'life': 10, 'clock': 10, 'speed': 10, 'revive': 30 };

//     for (const row of data) {
//         let spent = 0;

//         if (row.itemsBought && row.itemsBought !== "None") {
//             row.itemsBought.split(",").forEach(entry => {
//                 const [item, count] = entry.trim().split(":");
//                 const lowerItem = item?.toLowerCase();
//                 const price = itemCosts[lowerItem] || 0;
//                 spent += (parseInt(count) || 0) * price;
//             });
//         }

//         totalCoinsSpent += spent;

//         // 這裡使用 coinCount 欄位來推估賺取金幣
//         if (row.coinCount && !isNaN(parseInt(row.coinCount))) {
//             const leftover = parseInt(row.coinCount);
//             totalCoinsEarned += (leftover + spent); // 賺取 = 剩下 + 花費
//         } else {
//             console.log('⚠️ 缺少 coinCount 欄位或格式錯誤，跳過該筆');
//         }
//     }

//     console.log('💰 金幣統計:');
//     console.log('  - 總花費:', totalCoinsSpent);
//     console.log('  - 推估總賺取:', totalCoinsEarned);
//     console.log('  - 總盈餘:', totalCoinsEarned - totalCoinsSpent);

//     result.coinsSpent = totalCoinsSpent;
//     result.coinsEarned = totalCoinsEarned;
//     result.dailyCoins = totalCoinsEarned - totalCoinsSpent;



//     // 打印分析結果
//     console.log('📊 分析結果:');
//     console.log('  - 總遊戲次數:', result.totalGames);
//     console.log('  - 總通關次數:', result.totalCleared);
//     console.log('  - 通關率:', result.clearRate + '%');
//     console.log('  - 關卡統計:', JSON.stringify(result.levelStats, null, 2));
//     console.log('  - 平均耗時:', JSON.stringify(result.levelAverageTimes, null, 2));
//     console.log('  - 平均步數:', JSON.stringify(result.levelAverageSteps, null, 2));
//     console.log('  - 平均扣血:', JSON.stringify(result.levelAverageDamage, null, 2));
//     console.log('  - 商品統計:', JSON.stringify(result.itemStats, null, 2));

//     // ✅ 顯示各玩家資料
//     if (result.players && Array.isArray(result.players)) {
//         console.log('👥 各玩家統計:');
//         result.players.forEach((player, idx) => {
//             console.log(`  - 玩家 ${idx + 1} (${player.name || player.playerId}):`);
//             console.log(`    • 總遊玩時間: ${player.totalPlayTime} 分鐘`);
//             console.log(`    • 通關次數: ${player.totalCleared}`);
//             console.log(`    • 關卡次數:`, JSON.stringify(player.levelCounts, null, 2));
//             console.log(`    • 總步數: ${player.totalSteps}`);
//             console.log(`    • 扣血總和: ${player.totalDamage}`);
//             console.log(`    • 購買道具統計:`, JSON.stringify(player.itemStats, null, 2));
//         });
//     }


//     return result;
// }
function analyzeGameData(data) {
    console.log(`🔍 開始分析遊戲數據，共 ${data.length} 筆記錄`);

    const levelStats = {};
    const levelTimes = {}; // 記錄各關卡的耗時數據
    const levelSteps = {}; // 記錄各關卡的步數數據
    const levelDamage = {}; // 記錄各關卡的扣血量數據
    const itemStats = { '血量': 0, '時間': 0, '速度': 0, '復活': 0 };
    const hourlyPlayTime = {};

    // ✅ 新增：玩家統計和匿名化
    const playerStats = {}; // playerId -> 玩家統計
    const playerDailyPlayTime = {}; // anonymousName -> { date -> minutes }
    const playerIdMap = {}; // playerId -> anonymousName (玩家1, 玩家2...)
    let playerCounter = 1;

    let totalPlayTimeSeconds = 0;
    let totalSteps = 0;
    let totalDamage = 0;
    let totalCoins = 0;
    let gamesWithSteps = 0;
    let gamesWithDamage = 0;

    // 先打印前幾筆數據來檢查格式
    if (data.length > 0) {
        console.log('📋 數據樣本:', JSON.stringify(data[0], null, 2));
    }

    for (const row of data) {
        const level = row.level || "1";
        const cleared = row.isCleared === "TRUE" || row.isCleared === "true" || row.isCleared === true;
        const playerId = row.playerId || 'unknown';
        const gameDate = getDateString(row.timestamp);

        // ✅ 為玩家分配匿名名稱
        if (!playerIdMap[playerId]) {
            playerIdMap[playerId] = `玩家${playerCounter}`;
            playerCounter++;
        }
        const anonymousName = playerIdMap[playerId];

        // ✅ 初始化玩家統計
        if (!playerStats[playerId]) {
            playerStats[playerId] = {
                playerId: playerId,
                name: anonymousName, // 使用匿名名稱
                anonymousName: anonymousName,
                totalGames: 0,
                totalCleared: 0,
                totalPlayTimeSeconds: 0,
                totalSteps: 0,
                totalDamage: 0,
                totalCoins: 0,
                levelCounts: {},
                itemStats: { '血量': 0, '時間': 0, '速度': 0, '復活': 0 },
                firstPlayDate: gameDate,
                lastPlayDate: gameDate
            };
        }

        // ✅ 初始化玩家每日遊玩時間（使用匿名名稱作為 key）
        if (!playerDailyPlayTime[anonymousName]) {
            playerDailyPlayTime[anonymousName] = {};
        }
        if (!playerDailyPlayTime[anonymousName][gameDate]) {
            playerDailyPlayTime[anonymousName][gameDate] = 0;
        }

        // ✅ 更新玩家統計
        const player = playerStats[playerId];
        player.totalGames++;
        if (cleared) player.totalCleared++;

        // 更新玩家關卡統計
        player.levelCounts[level] = (player.levelCounts[level] || 0) + 1;

        // 更新遊玩日期範圍
        if (gameDate < player.firstPlayDate) player.firstPlayDate = gameDate;
        if (gameDate > player.lastPlayDate) player.lastPlayDate = gameDate;

        // 關卡統計
        levelStats[level] = levelStats[level] || { total: 0, cleared: 0 };
        levelStats[level].total++;
        if (cleared) levelStats[level].cleared++;

        // 關卡耗時統計 - 只統計通關的記錄
        if (cleared && row.playTime) {
            if (!levelTimes[level]) {
                levelTimes[level] = { totalSeconds: 0, count: 0 };
            }

            const seconds = parsePlayTime(row.playTime);
            if (seconds > 0) {
                levelTimes[level].totalSeconds += seconds;
                levelTimes[level].count++;
                console.log(`⏱️ 關卡 ${level} 耗時: ${row.playTime} -> ${seconds}秒`);
            }
        }

        // 關卡步數統計 - 統計所有記錄
        if (row.stepCount && !isNaN(parseInt(row.stepCount))) {
            if (!levelSteps[level]) {
                levelSteps[level] = { totalSteps: 0, count: 0 };
            }

            const steps = parseInt(row.stepCount);
            levelSteps[level].totalSteps += steps;
            levelSteps[level].count++;

            // ✅ 更新玩家步數統計
            player.totalSteps += steps;

            console.log(`👣 關卡 ${level} 步數: ${steps}`);
        }

        // 關卡扣血量統計 - 統計所有記錄
        if (row.damageTaken && !isNaN(parseInt(row.damageTaken))) {
            if (!levelDamage[level]) {
                levelDamage[level] = { totalDamage: 0, count: 0 };
            }

            const damage = parseInt(row.damageTaken);
            levelDamage[level].totalDamage += damage;
            levelDamage[level].count++;

            // ✅ 更新玩家扣血統計
            player.totalDamage += damage;

            console.log(`💔 關卡 ${level} 扣血: ${damage}`);
        }

        // 商品統計
        if (row.itemsBought && row.itemsBought !== "None") {
            console.log(`🛒 商品購買: ${row.itemsBought}`);
            row.itemsBought.split(",").forEach(entry => {
                const [item, count] = entry.trim().split(":");
                if (item && count) {
                    const itemNameMap = {
                        'life': '血量',
                        'clock': '時間',
                        'speed': '速度',
                        'revive': '復活'
                    };
                    const displayName = itemNameMap[item.toLowerCase()] || item;
                    if (itemStats[displayName] !== undefined) {
                        itemStats[displayName] += parseInt(count || 0);

                        // ✅ 更新玩家商品統計
                        if (player.itemStats[displayName] !== undefined) {
                            player.itemStats[displayName] += parseInt(count || 0);
                        }
                    }
                }
            });
        }

        // ✅ 遊玩時間分析 - 同時更新玩家每日統計
        if (row.playTime) {
            console.log(`🎮 處理遊玩時間: "${row.playTime}" (${anonymousName}, 日期: ${gameDate})`);
            const seconds = parsePlayTime(row.playTime);
            const minutes = seconds / 60;

            totalPlayTimeSeconds += seconds;
            player.totalPlayTimeSeconds += seconds;

            // ✅ 更新玩家每日遊玩時間（使用匿名名稱）
            playerDailyPlayTime[anonymousName][gameDate] += minutes;

            console.log(`📊 ${anonymousName} 在 ${gameDate} 累計遊玩: ${playerDailyPlayTime[anonymousName][gameDate].toFixed(1)} 分鐘`);

            // 按小時統計遊玩時間
            if (row.timestamp) {
                try {
                    const hour = new Date(row.timestamp).getHours();
                    hourlyPlayTime[hour] = (hourlyPlayTime[hour] || 0) + minutes;
                } catch (e) {
                    // 時間戳解析失敗，忽略
                }
            }
        } else {
            console.log(`⚠️ 該記錄沒有 playTime 欄位`);
        }

        // 步數統計
        if (row.stepCount && !isNaN(parseInt(row.stepCount))) {
            totalSteps += parseInt(row.stepCount);
            gamesWithSteps++;
        }

        // 扣血量統計
        if (row.damageTaken && !isNaN(parseInt(row.damageTaken))) {
            totalDamage += parseInt(row.damageTaken);
            gamesWithDamage++;
        }

        // 金幣統計
        if (row.coinCount && !isNaN(parseInt(row.coinCount))) {
            const coins = parseInt(row.coinCount);
            totalCoins += coins;
            player.totalCoins += coins;
        }
    }

    // 計算通關率
    Object.keys(levelStats).forEach(level => {
        const stats = levelStats[level];
        stats.rate = stats.total > 0 ? ((stats.cleared / stats.total) * 100).toFixed(1) : 0;
    });

    // ✅ 計算玩家通關率和平均遊玩時間
    Object.keys(playerStats).forEach(playerId => {
        const player = playerStats[playerId];
        player.clearRate = player.totalGames > 0 ? ((player.totalCleared / player.totalGames) * 100).toFixed(1) : 0;
        player.totalPlayTime = Math.round(player.totalPlayTimeSeconds / 60); // 分鐘
        player.averageSteps = player.totalGames > 0 ? Math.round(player.totalSteps / player.totalGames) : 0;
        player.averageDamage = player.totalGames > 0 ? Math.round(player.totalDamage / player.totalGames) : 0;
    });

    // 計算各關卡平均耗時（分鐘）
    const levelAverageTimes = {};
    Object.keys(levelTimes).forEach(level => {
        const timeData = levelTimes[level];
        if (timeData.count > 0) {
            levelAverageTimes[level] = timeData.totalSeconds / timeData.count / 60; // 轉換為分鐘
        }
    });

    // 計算各關卡平均步數
    const levelAverageSteps = {};
    Object.keys(levelSteps).forEach(level => {
        const stepData = levelSteps[level];
        if (stepData.count > 0) {
            levelAverageSteps[level] = stepData.totalSteps / stepData.count;
        }
    });

    // 計算各關卡平均扣血量
    const levelAverageDamage = {};
    Object.keys(levelDamage).forEach(level => {
        const damageData = levelDamage[level];
        if (damageData.count > 0) {
            levelAverageDamage[level] = damageData.totalDamage / damageData.count;
        }
    });

    const totalGames = data.length;
    const totalCleared = data.filter(row =>
        row.isCleared === "TRUE" || row.isCleared === "true" || row.isCleared === true
    ).length;

    // 金幣統計
    let totalCoinsEarned = 0;
    let totalCoinsSpent = 0;

    const itemCosts = { 'life': 10, 'clock': 10, 'speed': 10, 'revive': 30 };

    for (const row of data) {
        let spent = 0;

        if (row.itemsBought && row.itemsBought !== "None") {
            row.itemsBought.split(",").forEach(entry => {
                const [item, count] = entry.trim().split(":");
                const lowerItem = item?.toLowerCase();
                const price = itemCosts[lowerItem] || 0;
                spent += (parseInt(count) || 0) * price;
            });
        }

        totalCoinsSpent += spent;

        if (row.coinCount && !isNaN(parseInt(row.coinCount))) {
            const leftover = parseInt(row.coinCount);
            totalCoinsEarned += (leftover + spent);
        }
    }

    const result = {
        totalGames,
        totalCleared,
        clearRate: totalGames > 0 ? ((totalCleared / totalGames) * 100).toFixed(1) : 0,
        totalPlayTime: Math.round(totalPlayTimeSeconds / 60),
        levelStats,
        levelAverageTimes,
        levelAverageSteps,
        levelAverageDamage,
        itemStats,
        hourlyPlayTime,
        dailyCoins: totalCoinsEarned - totalCoinsSpent,
        coinsSpent: totalCoinsSpent,
        coinsEarned: totalCoinsEarned,
        averageSteps: gamesWithSteps > 0 ? Math.round(totalSteps / gamesWithSteps) : 0,
        averageDamage: gamesWithDamage > 0 ? Math.round(totalDamage / gamesWithDamage) : 0,

        // ✅ 新增：玩家相關統計
        players: Object.values(playerStats),
        playerDailyPlayTime: playerDailyPlayTime,
        playerCount: Object.keys(playerStats).length
    };

    // 打印分析結果
    console.log('📊 分析結果:');
    console.log('  - 總遊戲次數:', result.totalGames);
    console.log('  - 總通關次數:', result.totalCleared);
    console.log('  - 通關率:', result.clearRate + '%');
    console.log('  - 玩家數量:', result.playerCount);

    // ✅ 顯示各玩家每日遊玩時間
    console.log('👥 各玩家每日遊玩時間:');
    Object.keys(playerDailyPlayTime).forEach(anonymousName => {
        console.log(`  - ${anonymousName}:`);
        const dailyTimes = playerDailyPlayTime[anonymousName];
        Object.keys(dailyTimes).sort().forEach(date => {
            const minutes = dailyTimes[date];
            if (minutes > 0) {
                console.log(`    • ${date}: ${minutes.toFixed(1)} 分鐘`);
            }
        });
    });

    // ✅ 顯示各玩家總體資料
    console.log('👥 各玩家總體統計:');
    result.players.forEach((player, idx) => {
        console.log(`  - ${player.anonymousName}:`);
        console.log(`    • 總遊玩時間: ${player.totalPlayTime} 分鐘`);
        console.log(`    • 總遊戲次數: ${player.totalGames}`);
        console.log(`    • 通關次數: ${player.totalCleared} (${player.clearRate}%)`);
        console.log(`    • 關卡次數:`, JSON.stringify(player.levelCounts, null, 2));
        console.log(`    • 平均步數: ${player.averageSteps}`);
        console.log(`    • 平均扣血: ${player.averageDamage}`);
        console.log(`    • 購買道具統計:`, JSON.stringify(player.itemStats, null, 2));
        console.log(`    • 遊玩期間: ${player.firstPlayDate} ~ ${player.lastPlayDate}`);
    });

    return result;
}
// 獲取日期字符串 (YYYY-MM-DD)
function getDateString(timestamp) {
    try {
        const date = new Date(timestamp);
        return date.toISOString().split('T')[0]; // 獲取 YYYY-MM-DD 格式
    } catch (e) {
        console.log(`❌ 無法解析時間戳: ${timestamp}`);
        return 'unknown';
    }
}



async function createCoinChart(gameData) {
    const canvas = createCanvas(CONFIG.charts.width, CONFIG.charts.height);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = CONFIG.charts.backgroundColor;
    ctx.fillRect(0, 0, CONFIG.charts.width, CONFIG.charts.height);

    drawText(ctx, '每日金幣統計', CONFIG.charts.width / 2, 40, CONFIG.charts.titleFontSize, '#333');

    const labels = ['賺取數', '花費數', '盈餘'];
    const values = [gameData.coinsEarned, gameData.coinsSpent, gameData.dailyCoins];
    const colors = ['#4285F4', '#FB8C00', '#888888'];

    const chartX = 100;
    const chartY = 80;
    const chartWidth = CONFIG.charts.width - 200;
    const chartHeight = CONFIG.charts.height - 160;
    const barWidth = chartWidth / labels.length * 0.6;
    const barSpacing = chartWidth / labels.length * 0.4;

    const max = Math.max(...values) * 1.1;

    // Y 軸
    for (let i = 0; i <= 5; i++) {
        const y = chartY + chartHeight - i * chartHeight / 5;
        const val = Math.round(i * max / 5);
        drawText(ctx, val.toString(), chartX - 15, y + 5, 12, '#666', 'right');

        ctx.strokeStyle = '#eee';
        ctx.beginPath();
        ctx.moveTo(chartX, y);
        ctx.lineTo(chartX + chartWidth, y);
        ctx.stroke();
    }

    // Bars
    labels.forEach((label, index) => {
        const value = values[index];
        const height = value / max * chartHeight;
        const x = chartX + index * (barWidth + barSpacing) + barSpacing / 2;
        const y = chartY + chartHeight - height;

        drawRect(ctx, x, y, barWidth, height, colors[index]);
        drawText(ctx, value.toString(), x + barWidth / 2, y - 10, 12, '#333');
        drawText(ctx, label, x + barWidth / 2, chartY + chartHeight + 20, 12, '#333');
    });

    return canvas.toBuffer('image/png');
}

// 解析遊玩時間
function parsePlayTime(timeStr) {
    if (!timeStr) {
        console.log('⚠️ parsePlayTime: 時間字符串為空');
        return 0;
    }

    console.log(`🕐 parsePlayTime: 輸入時間字符串 = "${timeStr}"`);

    try {
        let time = timeStr.toString();

        // 處理 PT 格式
        if (time.startsWith('PT')) {
            console.log(`🔄 parsePlayTime: 檢測到 PT 格式，原始值 = "${time}"`);
            time = time.substring(2).replace(/\.:(\d+)/, ':$1');
            console.log(`🔄 parsePlayTime: PT 格式處理後 = "${time}"`);
        }

        const parts = time.split(":").map(Number);
        console.log(`🔢 parsePlayTime: 分割後的部分 = [${parts.join(', ')}]`);

        let totalSeconds = 0;

        if (parts.length === 3) {
            const [h, m, s] = parts;
            totalSeconds = h * 3600 + m * 60 + s;
            console.log(`⏰ parsePlayTime: 時:分:秒格式 ${h}:${m}:${s} = ${totalSeconds}秒`);
        } else if (parts.length === 2) {
            const [m, s] = parts;
            totalSeconds = m * 60 + s;
            console.log(`⏰ parsePlayTime: 分:秒格式 ${m}:${s} = ${totalSeconds}秒`);
        } else if (parts.length === 1 && !isNaN(parts[0])) {
            totalSeconds = parts[0];
            console.log(`⏰ parsePlayTime: 純數字格式 ${parts[0]} = ${totalSeconds}秒`);
        } else {
            console.log(`❌ parsePlayTime: 無法解析的格式，parts.length = ${parts.length}`);
            return 0;
        }

        console.log(`✅ parsePlayTime: 最終結果 = ${totalSeconds}秒`);
        return totalSeconds;

    } catch (error) {
        console.error("❌ parsePlayTime 錯誤:", timeStr, error);
        return 0;
    }
}

// ===== 📈 圖表生成函數 (使用原生 Canvas) =====

// 輔助函數：繪製文字 (支援中文)
function drawText(ctx, text, x, y, fontSize = 14, color = '#333', align = 'center') {
    ctx.fillStyle = color;
    ctx.font = `${fontSize}px "Microsoft YaHei", "SimHei", "Arial Unicode MS", Arial, sans-serif`;
    ctx.textAlign = align;
    ctx.fillText(text, x, y);
}

// 輔助函數：繪製矩形
function drawRect(ctx, x, y, width, height, color, borderColor = null) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, width, height);

    if (borderColor) {
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, width, height);
    }
}

// 輔助函數：繪製圓形
function drawCircle(ctx, x, y, radius, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, 2 * Math.PI);
    ctx.fill();
}

// 1. 關卡通關率圖表 (堆疊長條圖)
async function createClearRateChart(gameData) {
    const canvas = createCanvas(CONFIG.charts.width, CONFIG.charts.height);
    const ctx = canvas.getContext('2d');

    // 背景
    ctx.fillStyle = CONFIG.charts.backgroundColor;
    ctx.fillRect(0, 0, CONFIG.charts.width, CONFIG.charts.height);

    // 標題
    drawText(ctx, '關卡通關率', CONFIG.charts.width / 2, 40, CONFIG.charts.titleFontSize, '#333');

    const levels = Object.keys(gameData.levelStats);

    if (levels.length === 0) {
        drawText(ctx, '暫無關卡數據', CONFIG.charts.width / 2, CONFIG.charts.height / 2, 16, '#666');
        return canvas.toBuffer('image/png');
    }

    // 圖表參數
    const chartX = 100;
    const chartY = 80;
    const chartWidth = CONFIG.charts.width - 200;
    const chartHeight = CONFIG.charts.height - 180;
    const barWidth = chartWidth / levels.length * 0.6;
    const barSpacing = chartWidth / levels.length * 0.4;

    // 顏色設定 - 成功(藍色), 失敗(橘色)
    const successColor = 'rgba(70, 130, 180, 0.8)'; // 藍色
    const failColor = 'rgba(255, 140, 60, 0.8)';    // 橘色

    // 繪製座標軸
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(chartX, chartY);
    ctx.lineTo(chartX, chartY + chartHeight);
    ctx.lineTo(chartX + chartWidth, chartY + chartHeight);
    ctx.stroke();

    // 繪製 Y 軸刻度 (0% 到 100%)
    for (let i = 0; i <= 10; i++) {
        const y = chartY + chartHeight - (i * chartHeight / 10);
        const value = i * 10;

        // 網格線
        ctx.strokeStyle = '#f0f0f0';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(chartX, y);
        ctx.lineTo(chartX + chartWidth, y);
        ctx.stroke();

        // Y軸標籤
        drawText(ctx, value + '%', chartX - 15, y + 5, 12, '#666', 'right');
    }

    // 繪製堆疊長條圖
    levels.forEach((level, index) => {
        const stats = gameData.levelStats[level];
        const total = stats.total;
        const cleared = stats.cleared;
        const failed = total - cleared;

        if (total === 0) return; // 跳過沒有數據的關卡

        const x = chartX + index * (barWidth + barSpacing) + barSpacing / 2;

        // 計算高度比例
        const successHeight = (cleared / total) * chartHeight;
        const failHeight = (failed / total) * chartHeight;

        // 繪製成功部分 (藍色，底部)
        const successY = chartY + chartHeight - successHeight;
        drawRect(ctx, x, successY, barWidth, successHeight, successColor);

        // 繪製失敗部分 (橘色，頂部)
        const failY = chartY + chartHeight - successHeight - failHeight;
        drawRect(ctx, x, failY, barWidth, failHeight, failColor);

        // 在柱狀圖上顯示數值
        if (successHeight > 30) { // 只有當區域夠大時才顯示數字
            drawText(ctx, cleared.toString(), x + barWidth / 2, successY + successHeight / 2 + 5, 14, '#fff');
        }

        if (failHeight > 30) { // 只有當區域夠大時才顯示數字
            drawText(ctx, failed.toString(), x + barWidth / 2, failY + failHeight / 2 + 5, 14, '#fff');
        }

        // X軸標籤 (關卡名稱)
        drawText(ctx, `第${level}關`, x + barWidth / 2, chartY + chartHeight + 25, 12, '#333');

        // 在柱狀圖頂部顯示通關率百分比
        const topY = Math.min(failY, successY) - 10;
        const clearRate = ((cleared / total) * 100).toFixed(1);
        drawText(ctx, clearRate + '%', x + barWidth / 2, topY, 12, '#333');
    });

    // 繪製圖例
    const legendY = chartY + chartHeight + 60;
    const legendItemWidth = 100;
    const legendStartX = CONFIG.charts.width / 2 - legendItemWidth;

    // 成功圖例
    ctx.fillStyle = successColor;
    ctx.fillRect(legendStartX, legendY, 15, 15);
    drawText(ctx, '成功', legendStartX + 25, legendY + 12, 12, '#333', 'left');

    // 失敗圖例
    ctx.fillStyle = failColor;
    ctx.fillRect(legendStartX + legendItemWidth, legendY, 15, 15);
    drawText(ctx, '失敗', legendStartX + legendItemWidth + 25, legendY + 12, 12, '#333', 'left');

    return canvas.toBuffer('image/png');
}

// 2. 商品購買統計圓餅圖
async function createItemPurchaseChart(gameData) {
    const canvas = createCanvas(CONFIG.charts.width, CONFIG.charts.height);
    const ctx = canvas.getContext('2d');

    // 背景
    ctx.fillStyle = CONFIG.charts.backgroundColor;
    ctx.fillRect(0, 0, CONFIG.charts.width, CONFIG.charts.height);

    // 標題
    drawText(ctx, '商品購買統計', CONFIG.charts.width / 2, 40, CONFIG.charts.titleFontSize, '#333');

    // 商品名稱映射（根據您的參考圖片）
    const itemMapping = {
        '血量': '回血草',
        '時間': '加時間',
        '速度': '增加移速',
        '復活': '復活'
    };

    // 處理數據並過濾掉數量為0的項目
    const items = Object.keys(gameData.itemStats);
    const purchases = Object.values(gameData.itemStats);
    const total = purchases.reduce((sum, val) => sum + val, 0);

    // 只保留有購買記錄的商品
    const validItems = [];
    const validPurchases = [];
    const validLabels = [];

    items.forEach((item, index) => {
        if (purchases[index] > 0) {
            validItems.push(item);
            validPurchases.push(purchases[index]);
            validLabels.push(itemMapping[item] || item);
        }
    });

    if (total === 0 || validItems.length === 0) {
        drawText(ctx, '暫無購買記錄', CONFIG.charts.width / 2, CONFIG.charts.height / 2, 16, '#666');
        return canvas.toBuffer('image/png');
    }

    const centerX = CONFIG.charts.width / 2;
    const centerY = CONFIG.charts.height / 2 + 10;
    const radius = 140;

    // 顏色設定（根據參考圖片的顏色）
    const colors = [
        'rgba(70, 130, 180, 0.8)',   // 藍色 - 回血草
        'rgba(255, 140, 60, 0.8)',   // 橘色 - 加時間
        'rgba(150, 150, 150, 0.8)',  // 灰色 - 增加移速
        'rgba(255, 200, 60, 0.8)'    // 黃色 - 復活
    ];

    let currentAngle = -Math.PI / 2; // 從頂部開始

    // 繪製圓餅圖
    validItems.forEach((item, index) => {
        const percentage = validPurchases[index] / total;
        const sliceAngle = percentage * 2 * Math.PI;

        ctx.fillStyle = colors[index % colors.length];
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + sliceAngle);
        ctx.closePath();
        ctx.fill();

        // 繪製白色邊框
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;
        ctx.stroke();

        // 在扇形內部顯示百分比
        const labelAngle = currentAngle + sliceAngle / 2;
        const labelX = centerX + Math.cos(labelAngle) * (radius * 0.7);
        const labelY = centerY + Math.sin(labelAngle) * (radius * 0.7);

        const percentText = Math.round(percentage * 100) + '%';

        // 繪製百分比標籤（白色文字）
        drawText(ctx, percentText, labelX, labelY, 14, '#fff');

        // 如果百分比夠大，也顯示商品名稱
        if (percentage > 0.1) { // 大於10%才顯示名稱
            drawText(ctx, validLabels[index], labelX, labelY + 20, 12, '#fff');
        }

        currentAngle += sliceAngle;
    });

    // 繪製圖例（在圓餅圖下方）
    const legendY = centerY + radius + 50;
    const legendItemWidth = 100;
    const totalLegendWidth = validItems.length * legendItemWidth;
    const legendStartX = centerX - totalLegendWidth / 2;

    validItems.forEach((item, index) => {
        const x = legendStartX + index * legendItemWidth;
        const percentage = ((validPurchases[index] / total) * 100).toFixed(0);

        // 顏色方塊
        ctx.fillStyle = colors[index % colors.length];
        ctx.fillRect(x, legendY, 15, 15);

        // 邊框
        ctx.strokeStyle = '#ccc';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, legendY, 15, 15);

        // 文字標籤
        drawText(ctx, `■ ${validLabels[index]}`, x + 25, legendY + 12, 12, '#333', 'left');

        // 顯示實際數量
        drawText(ctx, `${validPurchases[index]} (${percentage}%)`, x + 25, legendY + 28, 10, '#666', 'left');
    });

    return canvas.toBuffer('image/png');
}

// 3. 每小時遊玩時間圖表
// async function createHourlyPlayTimeChart(gameData) {
//     const canvas = createCanvas(CONFIG.charts.width, CONFIG.charts.height);
//     const ctx = canvas.getContext('2d');

//     // 背景
//     ctx.fillStyle = CONFIG.charts.backgroundColor;
//     ctx.fillRect(0, 0, CONFIG.charts.width, CONFIG.charts.height);

//     // 標題
//     drawText(ctx, '每小時遊玩時間分布', CONFIG.charts.width / 2, 40, CONFIG.charts.titleFontSize, '#2c5aa0');

//     const hours = Array.from({ length: 24 }, (_, i) => i);
//     const playTimes = hours.map(hour => gameData.hourlyPlayTime[hour] || 0);
//     const maxTime = Math.max(...playTimes) || 1;

//     // 圖表參數
//     const chartX = 60;
//     const chartY = 80;
//     const chartWidth = CONFIG.charts.width - 120;
//     const chartHeight = CONFIG.charts.height - 160;

//     // 繪製座標軸
//     ctx.strokeStyle = '#ddd';
//     ctx.lineWidth = 1;
//     ctx.beginPath();
//     ctx.moveTo(chartX, chartY);
//     ctx.lineTo(chartX, chartY + chartHeight);
//     ctx.lineTo(chartX + chartWidth, chartY + chartHeight);
//     ctx.stroke();

//     // 繪製網格線
//     for (let i = 0; i <= 5; i++) {
//         const y = chartY + chartHeight - (i * chartHeight / 5);
//         const value = (i * maxTime / 5).toFixed(1);

//         ctx.strokeStyle = '#eee';
//         ctx.beginPath();
//         ctx.moveTo(chartX, y);
//         ctx.lineTo(chartX + chartWidth, y);
//         ctx.stroke();

//         drawText(ctx, value, chartX - 10, y + 5, 10, '#666', 'right');
//     }

//     // 繪製折線圖
//     ctx.strokeStyle = 'rgba(75, 192, 192, 1)';
//     ctx.lineWidth = 3;
//     ctx.beginPath();

//     hours.forEach((hour, index) => {
//         const x = chartX + (index * chartWidth / 23);
//         const y = chartY + chartHeight - (playTimes[index] / maxTime * chartHeight);

//         if (index === 0) {
//             ctx.moveTo(x, y);
//         } else {
//             ctx.lineTo(x, y);
//         }
//     });

//     ctx.stroke();

//     // 繪製數據點
//     hours.forEach((hour, index) => {
//         if (playTimes[index] > 0) {
//             const x = chartX + (index * chartWidth / 23);
//             const y = chartY + chartHeight - (playTimes[index] / maxTime * chartHeight);

//             drawCircle(ctx, x, y, 4, 'rgba(75, 192, 192, 1)');
//         }
//     });

//     // X軸標籤 (每4小時顯示一次)
//     for (let i = 0; i < 24; i += 4) {
//         const x = chartX + (i * chartWidth / 23);
//         drawText(ctx, i + ':00', x, chartY + chartHeight + 20, 10, '#666');
//     }

//     return canvas.toBuffer('image/png');
// }
// async function createDailyTotalPlayTimeChart(gameData) {
//     const canvas = createCanvas(CONFIG.charts.width, CONFIG.charts.height);
//     const ctx = canvas.getContext('2d');

//     ctx.fillStyle = CONFIG.charts.backgroundColor;
//     ctx.fillRect(0, 0, CONFIG.charts.width, CONFIG.charts.height);

//     drawText(ctx, '每日遊玩時數 (分鐘)', CONFIG.charts.width / 2, 40, CONFIG.charts.titleFontSize, '#333');

//     const value = gameData.totalPlayTime || 0;
//     const max = Math.max(60, value * 1.2); // 至少60分鐘作為y軸上限

//     const chartX = 100;
//     const chartY = 80;
//     const chartWidth = CONFIG.charts.width - 200;
//     const chartHeight = CONFIG.charts.height - 160;
//     const barWidth = 80;

//     // Y 軸刻度
//     for (let i = 0; i <= 5; i++) {
//         const y = chartY + chartHeight - i * chartHeight / 5;
//         const val = Math.round(i * max / 5);
//         drawText(ctx, val.toString(), chartX - 15, y + 5, 12, '#666', 'right');

//         ctx.strokeStyle = '#eee';
//         ctx.beginPath();
//         ctx.moveTo(chartX, y);
//         ctx.lineTo(chartX + chartWidth, y);
//         ctx.stroke();
//     }

//     // 畫柱狀圖
//     const barHeight = value / max * chartHeight;
//     const x = chartX + (chartWidth - barWidth) / 2;
//     const y = chartY + chartHeight - barHeight;

//     drawRect(ctx, x, y, barWidth, barHeight, '#4285F4');
//     drawText(ctx, value.toString() + ' 分鐘', x + barWidth / 2, y - 10, 14, '#333');
//     drawText(ctx, '玩家1', x + barWidth / 2, chartY + chartHeight + 20, 12, '#333');

//     return canvas.toBuffer('image/png');
// }
async function createDailyTotalPlayTimeChart(gameData) {
    const canvas = createCanvas(CONFIG.charts.width, CONFIG.charts.height);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = CONFIG.charts.backgroundColor;
    ctx.fillRect(0, 0, CONFIG.charts.width, CONFIG.charts.height);

    drawText(ctx, '每日遊玩時數 (分鐘)', CONFIG.charts.width / 2, 40, CONFIG.charts.titleFontSize, '#333');

    const players = gameData.players || [];

    // ✅ 正確取得最大值後乘以 1.2
    const maxPlayTime = Math.max(60, ...players.map(p => p.totalPlayTime || 0)) * 1.2;

    const chartX = 100;
    const chartY = 80;
    const chartWidth = CONFIG.charts.width - 200;
    const chartHeight = CONFIG.charts.height - 160;

    const barSpacing = 20;
    const barWidth = (chartWidth - barSpacing * (players.length - 1)) / players.length;

    // 畫 Y 軸刻度
    for (let i = 0; i <= 5; i++) {
        const y = chartY + chartHeight - i * chartHeight / 5;
        const val = Math.round(i * maxPlayTime / 5);
        drawText(ctx, val.toString(), chartX - 15, y + 5, 12, '#666', 'right');

        ctx.strokeStyle = '#eee';
        ctx.beginPath();
        ctx.moveTo(chartX, y);
        ctx.lineTo(chartX + chartWidth, y);
        ctx.stroke();
    }

    // 畫每個玩家的 bar
    players.forEach((player, index) => {
        const value = player.totalPlayTime || 0;
        const height = value / maxPlayTime * chartHeight;
        const x = chartX + index * (barWidth + barSpacing);
        const y = chartY + chartHeight - height;

        drawRect(ctx, x, y, barWidth, height, '#4285F4');
        drawText(ctx, value + ' 分鐘', x + barWidth / 2, y - 10, 14, '#333');
        drawText(ctx, player.name, x + barWidth / 2, chartY + chartHeight + 20, 12, '#333');
    });

    return canvas.toBuffer('image/png');
}

// 4. 通關平均耗時統計圖表
async function createClearTimeTrendChart(historicalData) {
    const canvas = createCanvas(CONFIG.charts.width, CONFIG.charts.height);
    const ctx = canvas.getContext('2d');

    // 背景
    ctx.fillStyle = CONFIG.charts.backgroundColor;
    ctx.fillRect(0, 0, CONFIG.charts.width, CONFIG.charts.height);

    // 標題
    drawText(ctx, '平均耗時(分鐘)', CONFIG.charts.width / 2, 40, CONFIG.charts.titleFontSize, '#333');

    // 從最新的數據中獲取平均耗時 - 修正數據來源
    const gameData = historicalData.length > 0 ? historicalData[historicalData.length - 1] : {};
    const levelAverageTimes = gameData.levelAverageTimes || {};

    console.log(`🎯 通關平均耗時圖表 - 數據來源:`, JSON.stringify(levelAverageTimes, null, 2));

    const levels = Object.keys(levelAverageTimes);

    if (levels.length === 0) {
        console.log('⚠️ 通關平均耗時圖表: 沒有平均耗時數據');
        drawText(ctx, '暫無通關耗時數據', CONFIG.charts.width / 2, CONFIG.charts.height / 2, 16, '#666');
        return canvas.toBuffer('image/png');
    }

    const times = levels.map(level => levelAverageTimes[level]);
    console.log(`📊 通關平均耗時: 關卡=[${levels.join(', ')}], 時間=[${times.join(', ')}]分鐘`);

    // 圖表參數
    const chartX = 100;
    const chartY = 80;
    const chartWidth = CONFIG.charts.width - 200;
    const chartHeight = CONFIG.charts.height - 160;
    const barWidth = chartWidth / levels.length * 0.6;
    const barSpacing = chartWidth / levels.length * 0.4;

    // 計算 Y 軸最大值
    const maxTime = Math.max(...times);
    const yAxisMax = Math.ceil(maxTime * 1.2); // 留一些空間

    console.log(`📈 Y軸設定: 最大時間=${maxTime}分鐘, Y軸最大值=${yAxisMax}`);

    // 繪製座標軸
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(chartX, chartY);
    ctx.lineTo(chartX, chartY + chartHeight);
    ctx.lineTo(chartX + chartWidth, chartY + chartHeight);
    ctx.stroke();

    // 繪製 Y 軸刻度和網格線
    const ySteps = Math.min(Math.ceil(yAxisMax), 10); // 最多10個刻度
    for (let i = 0; i <= ySteps; i++) {
        const y = chartY + chartHeight - (i * chartHeight / ySteps);
        const value = (i * yAxisMax / ySteps).toFixed(1);

        // 網格線
        ctx.strokeStyle = '#f0f0f0';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(chartX, y);
        ctx.lineTo(chartX + chartWidth, y);
        ctx.stroke();

        // Y軸標籤
        drawText(ctx, value, chartX - 15, y + 5, 12, '#666', 'right');
    }

    // 柱狀圖顏色
    const barColor = 'rgba(70, 130, 180, 0.8)'; // 藍色

    // 繪製柱狀圖
    levels.forEach((level, index) => {
        const time = times[index];
        const barHeight = (time / yAxisMax) * chartHeight;
        const x = chartX + index * (barWidth + barSpacing) + barSpacing / 2;
        const y = chartY + chartHeight - barHeight;

        console.log(`🏗️ 繪製第${level}關: 時間=${time}分鐘, 柱高=${barHeight}, 位置=(${x}, ${y})`);

        // 繪製柱子
        drawRect(ctx, x, y, barWidth, barHeight, barColor);

        // 在柱狀圖上方顯示數值（格式化為 時:分:秒 或分:秒）
        const timeText = formatTime(time * 60); // 轉換為秒後格式化
        drawText(ctx, timeText, x + barWidth / 2, y - 15, 12, '#333');

        // X軸標籤
        drawText(ctx, `第${level}關`, x + barWidth / 2, chartY + chartHeight + 25, 12, '#333');
    });

    // 繪製圖例
    const legendY = chartY + chartHeight + 60;
    const legendX = CONFIG.charts.width / 2 - 50;

    // 顏色方塊
    ctx.fillStyle = barColor;
    ctx.fillRect(legendX, legendY, 15, 15);

    // 邊框
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 1;
    ctx.strokeRect(legendX, legendY, 15, 15);

    // 圖例文字
    drawText(ctx, '■ 平均耗時(分鐘)', legendX + 25, legendY + 12, 12, '#333', 'left');

    console.log('✅ 通關平均耗時圖表生成完成');

    return canvas.toBuffer('image/png');
}

// 輔助函數：格式化時間顯示（秒數轉換為 時:分:秒 或 分:秒）
function formatTime(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);

    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    } else {
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
}

// 5. 平均步數統計圖表
async function createAverageStepsChart(gameData) {
    const canvas = createCanvas(CONFIG.charts.width, CONFIG.charts.height);
    const ctx = canvas.getContext('2d');

    // 背景
    ctx.fillStyle = CONFIG.charts.backgroundColor;
    ctx.fillRect(0, 0, CONFIG.charts.width, CONFIG.charts.height);

    // 標題
    drawText(ctx, '平均步數', CONFIG.charts.width / 2, 40, CONFIG.charts.titleFontSize, '#333');

    // 從 gameData 中獲取各關卡的平均步數
    const levelAverageSteps = gameData.levelAverageSteps || {};
    const levels = Object.keys(levelAverageSteps);

    if (levels.length === 0) {
        drawText(ctx, '暫無步數數據', CONFIG.charts.width / 2, CONFIG.charts.height / 2, 16, '#666');
        return canvas.toBuffer('image/png');
    }

    const steps = levels.map(level => levelAverageSteps[level]);

    // 圖表參數
    const chartX = 100;
    const chartY = 80;
    const chartWidth = CONFIG.charts.width - 200;
    const chartHeight = CONFIG.charts.height - 160;
    const barWidth = chartWidth / levels.length * 0.6;
    const barSpacing = chartWidth / levels.length * 0.4;

    // 計算 Y 軸最大值
    const maxSteps = Math.max(...steps);
    const yAxisMax = Math.ceil(maxSteps / 50) * 50; // 向上取整到50的倍數

    // 繪製座標軸
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(chartX, chartY);
    ctx.lineTo(chartX, chartY + chartHeight);
    ctx.lineTo(chartX + chartWidth, chartY + chartHeight);
    ctx.stroke();

    // 繪製 Y 軸刻度和網格線
    const ySteps = 8; // 分8格
    for (let i = 0; i <= ySteps; i++) {
        const y = chartY + chartHeight - (i * chartHeight / ySteps);
        const value = Math.round(i * yAxisMax / ySteps);

        // 網格線
        ctx.strokeStyle = '#f0f0f0';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(chartX, y);
        ctx.lineTo(chartX + chartWidth, y);
        ctx.stroke();

        // Y軸標籤
        drawText(ctx, value.toString(), chartX - 15, y + 5, 12, '#666', 'right');
    }

    // 柱狀圖顏色
    const barColor = 'rgba(70, 130, 180, 0.8)'; // 藍色

    // 繪製柱狀圖
    levels.forEach((level, index) => {
        const stepCount = steps[index];
        const barHeight = (stepCount / yAxisMax) * chartHeight;
        const x = chartX + index * (barWidth + barSpacing) + barSpacing / 2;
        const y = chartY + chartHeight - barHeight;

        // 繪製柱子
        drawRect(ctx, x, y, barWidth, barHeight, barColor);

        // 在柱狀圖上方顯示數值
        drawText(ctx, Math.round(stepCount).toString(), x + barWidth / 2, y - 15, 14, '#333');

        // X軸標籤
        drawText(ctx, `第${level}關`, x + barWidth / 2, chartY + chartHeight + 25, 12, '#333');
    });

    // 繪製圖例
    const legendY = chartY + chartHeight + 60;
    const legendX = CONFIG.charts.width / 2 - 30;

    // 顏色方塊
    ctx.fillStyle = barColor;
    ctx.fillRect(legendX, legendY, 15, 15);

    // 邊框
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 1;
    ctx.strokeRect(legendX, legendY, 15, 15);

    // 圖例文字
    drawText(ctx, '■ 平均步數', legendX + 25, legendY + 12, 12, '#333', 'left');

    return canvas.toBuffer('image/png');
}

// 6. 平均扣血量統計圖表
async function createAverageDamageChart(gameData) {
    const canvas = createCanvas(CONFIG.charts.width, CONFIG.charts.height);
    const ctx = canvas.getContext('2d');

    // 背景
    ctx.fillStyle = CONFIG.charts.backgroundColor;
    ctx.fillRect(0, 0, CONFIG.charts.width, CONFIG.charts.height);

    // 標題
    drawText(ctx, '平均扣血量', CONFIG.charts.width / 2, 40, CONFIG.charts.titleFontSize, '#333');

    // 從 gameData 中獲取各關卡的平均扣血量
    const levelAverageDamage = gameData.levelAverageDamage || {};
    const levels = Object.keys(levelAverageDamage);

    if (levels.length === 0) {
        drawText(ctx, '暫無扣血量數據', CONFIG.charts.width / 2, CONFIG.charts.height / 2, 16, '#666');
        return canvas.toBuffer('image/png');
    }

    const damages = levels.map(level => levelAverageDamage[level]);

    // 圖表參數
    const chartX = 100;
    const chartY = 80;
    const chartWidth = CONFIG.charts.width - 200;
    const chartHeight = CONFIG.charts.height - 160;
    const barWidth = chartWidth / levels.length * 0.6;
    const barSpacing = chartWidth / levels.length * 0.4;

    // 計算 Y 軸最大值
    const maxDamage = Math.max(...damages);
    const yAxisMax = Math.ceil(maxDamage / 10) * 10; // 向上取整到10的倍數

    // 繪製座標軸
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(chartX, chartY);
    ctx.lineTo(chartX, chartY + chartHeight);
    ctx.lineTo(chartX + chartWidth, chartY + chartHeight);
    ctx.stroke();

    // 繪製 Y 軸刻度和網格線
    const ySteps = Math.min(yAxisMax, 10); // 最多10個刻度
    for (let i = 0; i <= ySteps; i++) {
        const y = chartY + chartHeight - (i * chartHeight / ySteps);
        const value = Math.round(i * yAxisMax / ySteps);

        // 網格線
        ctx.strokeStyle = '#f0f0f0';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(chartX, y);
        ctx.lineTo(chartX + chartWidth, y);
        ctx.stroke();

        // Y軸標籤
        drawText(ctx, value.toString(), chartX - 15, y + 5, 12, '#666', 'right');
    }

    // 柱狀圖顏色
    const barColor = 'rgba(70, 130, 180, 0.8)'; // 藍色

    // 繪製柱狀圖
    levels.forEach((level, index) => {
        const damageAmount = damages[index];
        const barHeight = (damageAmount / yAxisMax) * chartHeight;
        const x = chartX + index * (barWidth + barSpacing) + barSpacing / 2;
        const y = chartY + chartHeight - barHeight;

        // 繪製柱子
        drawRect(ctx, x, y, barWidth, barHeight, barColor);

        // 在柱狀圖上方顯示數值
        drawText(ctx, Math.round(damageAmount).toString(), x + barWidth / 2, y - 15, 14, '#333');

        // X軸標籤
        drawText(ctx, `第${level}關`, x + barWidth / 2, chartY + chartHeight + 25, 12, '#333');
    });

    // 繪製圖例
    const legendY = chartY + chartHeight + 60;
    const legendX = CONFIG.charts.width / 2 - 40;

    // 顏色方塊
    ctx.fillStyle = barColor;
    ctx.fillRect(legendX, legendY, 15, 15);

    // 邊框
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 1;
    ctx.strokeRect(legendX, legendY, 15, 15);

    // 圖例文字
    drawText(ctx, '■ 平均扣血量', legendX + 25, legendY + 12, 12, '#333', 'left');

    return canvas.toBuffer('image/png');
}
// 8. 遊戲綜合統計圖表
async function createSummaryChart(gameData) {
    const canvas = createCanvas(CONFIG.charts.width, CONFIG.charts.height);
    const ctx = canvas.getContext('2d');

    // 背景
    ctx.fillStyle = CONFIG.charts.backgroundColor;
    ctx.fillRect(0, 0, CONFIG.charts.width, CONFIG.charts.height);

    // 標題
    drawText(ctx, '遊戲綜合統計', CONFIG.charts.width / 2, 40, CONFIG.charts.titleFontSize, '#2c5aa0');

    const stats = [
        { label: '總遊戲次數', value: gameData.totalGames },
        { label: '總通關次數', value: gameData.totalCleared },
        { label: '平均步數', value: gameData.averageSteps },
        { label: '平均扣血', value: gameData.averageDamage }
    ];

    const maxValue = Math.max(...stats.map(s => s.value)) || 1;

    // 圖表參數
    const chartX = 100;
    const chartY = 80;
    const chartWidth = CONFIG.charts.width - 200;
    const chartHeight = CONFIG.charts.height - 160;
    const barHeight = chartHeight / stats.length * 0.6;
    const barSpacing = chartHeight / stats.length * 0.4;

    const colors = [
        'rgba(255, 99, 132, 0.8)',
        'rgba(54, 162, 235, 0.8)',
        'rgba(255, 206, 86, 0.8)',
        'rgba(75, 192, 192, 0.8)'
    ];

    // 繪製座標軸
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(chartX, chartY);
    ctx.lineTo(chartX, chartY + chartHeight);
    ctx.lineTo(chartX + chartWidth, chartY + chartHeight);
    ctx.stroke();

    // 繪製水平柱狀圖
    stats.forEach((stat, index) => {
        const barWidth = (stat.value / maxValue) * chartWidth;
        const y = chartY + index * (barHeight + barSpacing) + barSpacing / 2;

        drawRect(ctx, chartX, y, barWidth, barHeight, colors[index]);

        // 標籤
        drawText(ctx, stat.label, chartX - 10, y + barHeight / 2 + 5, 12, '#333', 'right');
        drawText(ctx, stat.value.toString(), chartX + barWidth + 10, y + barHeight / 2 + 5, 12, '#333', 'left');
    });

    return canvas.toBuffer('image/png');
}



// ===== 📧 郵件發送函數 =====

// 建立郵件傳送器
function createEmailTransporter() {
    return nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: CONFIG.gmail.user,
            pass: CONFIG.gmail.pass
        }
    });
}

// 生成包含圖表的郵件內容
async function generateEmailContentWithCharts(gameData, recipientName) {
    const taiwanDate = new Date().toLocaleString('zh-TW', {
        timeZone: 'Asia/Taipei',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'long'
    });

    const subject = `🎮 每日遊戲數據報告 - ${taiwanDate}`;

    // 處理無數據的情況
    if (gameData.isEmpty) {
        const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #667eea; text-align: center;">🎮 每日遊戲數據報告</h2>
            <p style="text-align: center; color: #666;">報告日期: ${taiwanDate}</p>
            <p style="text-align: center; color: #666;">收件人: ${recipientName}</p>
            
            <div style="background: #fff3cd; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
                <h3 style="color: #856404; margin-top: 0;">📭 今日暫無遊戲數據</h3>
                <p style="color: #856404;">${gameData.error ? `錯誤: ${gameData.error}` : gameData.message || '今日尚未有玩家進行遊戲'}</p>
            </div>
            
            <div style="margin-top: 30px; padding: 15px; background: #667eea; color: white; border-radius: 8px; text-align: center;">
                <p style="margin: 5px 0;">此郵件由 Node.js 自動化系統發送</p>
                <p style="margin: 5px 0;">發送時間: ${new Date().toLocaleString('zh-TW', { timeZone: CONFIG.timezone })}</p>
            </div>
        </div>
        `;

        return {
            subject: subject + ' (無數據)',
            htmlContent,
            textContent: `今日無遊戲數據\n${gameData.message || ''}`,
            attachments: []
        };
    }

    // 生成圖表
    console.log('📊 正在生成圖表...');
    const charts = {};

    try {
        // 獲取 Google Sheets 中實際存在的歷史數據
        console.log('📊 正在從 Google Sheets 獲取歷史數據...');
        const historicalData = await fetchHistoricalDataFromSheets(7);

        console.log('📋 開始生成圖表...');

        charts.dailyTotalPlayTime = await createDailyTotalPlayTimeChart(gameData);
        console.log('✅ 每日遊玩時數圖表生成完成');

        charts.clearRate = await createClearRateChart(gameData);
        console.log('✅ 關卡通關率圖表生成完成');

        charts.itemPurchase = await createItemPurchaseChart(gameData);
        console.log('✅ 商品購買統計圖表生成完成');

        // charts.dailyPlayTime = await createHourlyPlayTimeChart(gameData);
        // console.log('✅ 每日遊玩時數圖表生成完成');

        // 注意：這裡傳入的是包含當前數據的 historicalData
        charts.trendChart = await createClearTimeTrendChart([gameData]); // 直接傳入當前數據
        console.log('✅ 通關平均耗時圖表生成完成');

        charts.averageSteps = await createAverageStepsChart(gameData);
        console.log('✅ 平均步數圖表生成完成');

        charts.averageDamage = await createAverageDamageChart(gameData);
        console.log('✅ 平均扣血量圖表生成完成');


        charts.coinChart = await createCoinChart(gameData); // ✅ 加上這行
        console.log('✅ 金幣統計圖表生成完成');

        // charts.summary = await createSummaryChart(gameData);
        // console.log('✅ 遊戲綜合統計圖表生成完成');

        console.log('✅ 圖表生成完成');



    } catch (error) {
        console.error('❌ 圖表生成失敗:', error.message);
    }

    // 有數據的情況 - 包含圖表
    const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 900px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #667eea; text-align: center;">🎮 每日遊戲數據報告</h2>
        <p style="text-align: center; color: #666;">報告日期: ${taiwanDate}</p>
        <p style="text-align: center; color: #666;">收件人: ${recipientName}</p>

        <!-- 圖表區域 -->
        <div style="margin: 30px 0;">
            <h3 style="color: #2c5aa0; margin-bottom: 20px;">📈 數據可視化圖表</h3>



            <!-- 關卡通關率圖表 -->
            <div style="margin: 20px 0; text-align: center;">
                <img src="cid:clearRateChart" alt="關卡通關率圖表" style="max-width: 100%; height: auto; border: 1px solid #ddd; border-radius: 8px;">
            </div>
            
            <!-- 商品購買統計圖表 -->
            <div style="margin: 20px 0; text-align: center;">
                <img src="cid:itemPurchaseChart" alt="商品購買統計圖表" style="max-width: 100%; height: auto; border: 1px solid #ddd; border-radius: 8px;">
            </div>
            
              <!-- ✅ 添加每日遊玩時數圖表 -->
            <div style="margin: 20px 0; text-align: center;">
                <img src="cid:dailyTotalPlayTimeChart" alt="每日遊玩時數圖表" style="max-width: 100%; height: auto; border: 1px solid #ddd; border-radius: 8px;">
            </div>
            
            <!-- 通關平均耗時統計圖表 -->
            <div style="margin: 20px 0; text-align: center;">
                <img src="cid:trendChart" alt="通關平均耗時統計圖表" style="max-width: 100%; height: auto; border: 1px solid #ddd; border-radius: 8px;">
            </div>
            
            <!-- 平均步數統計圖表 -->
            <div style="margin: 20px 0; text-align: center;">
                <img src="cid:averageStepsChart" alt="平均步數統計圖表" style="max-width: 100%; height: auto; border: 1px solid #ddd; border-radius: 8px;">
            </div>
            
            <!-- 平均扣血量統計圖表 -->
            <div style="margin: 20px 0; text-align: center;">
                <img src="cid:averageDamageChart" alt="平均扣血量統計圖表" style="max-width: 100%; height: auto; border: 1px solid #ddd; border-radius: 8px;">
            </div>
            <!-- 金幣統計圖表 -->
            <div style="margin: 20px 0; text-align: center;">
                <img src="cid:coinChart" alt="金幣統計圖表" style="max-width: 100%; height: auto; border: 1px solid #ddd; border-radius: 8px;">
            </div>

       
        </div>
        
        ${gameData.message ? `
        <div style="background: #d1ecf1; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0; color: #0c5460;"><strong>備註:</strong> ${gameData.message}</p>
        </div>
        ` : ''}
        
        <div style="margin-top: 30px; padding: 15px; background: #667eea; color: white; border-radius: 8px; text-align: center;">
            <p style="margin: 5px 0;">此郵件由 Node.js 自動化系統發送</p>
            <p style="margin: 5px 0;">發送時間: ${new Date().toLocaleString('zh-TW', { timeZone: CONFIG.timezone })}</p>
            <p style="margin: 5px 0;">數據筆數: ${gameData.count || 0} 筆</p>
        </div>
    </div>
    `;

    const textContent = `
🎮 每日遊戲數據報告 - ${taiwanDate}

📈 數據可視化圖表已包含在郵件中：
• 關卡通關率統計
• 商品購買統計
• 每日遊玩時數
• 通關平均耗時統計
• 平均步數統計
• 平均扣血量統計
• 遊戲綜合統計

此郵件由 Node.js 自動化系統發送
發送時間: ${new Date().toLocaleString('zh-TW', { timeZone: CONFIG.timezone })}
數據筆數: ${gameData.count || 0} 筆
    `;

    // 準備附件
    const attachments = [];

    if (charts.dailyTotalPlayTime) {
        attachments.push({
            filename: 'dailyTotalPlayTimeChart.png',
            content: charts.dailyTotalPlayTime,
            cid: 'dailyTotalPlayTimeChart'
        });
    }


    if (charts.clearRate) {
        attachments.push({
            filename: 'clearRateChart.png',
            content: charts.clearRate,
            cid: 'clearRateChart'
        });
    }
    if (charts.itemPurchase) {
        attachments.push({
            filename: 'itemPurchaseChart.png',
            content: charts.itemPurchase,
            cid: 'itemPurchaseChart'
        });
    }
    if (charts.dailyPlayTime) {
        attachments.push({
            filename: 'dailyPlayTimeChart.png',
            content: charts.dailyPlayTime,
            cid: 'dailyPlayTimeChart'
        });
    }
    if (charts.trendChart) {
        attachments.push({
            filename: 'trendChart.png',
            content: charts.trendChart,
            cid: 'trendChart'
        });
    }
    if (charts.averageSteps) {
        attachments.push({
            filename: 'averageStepsChart.png',
            content: charts.averageSteps,
            cid: 'averageStepsChart'
        });
    }
    if (charts.averageDamage) {
        attachments.push({
            filename: 'averageDamageChart.png',
            content: charts.averageDamage,
            cid: 'averageDamageChart'
        });
    }
    if (charts.coinChart) {
        attachments.push({
            filename: 'coinChart.png',
            content: charts.coinChart,
            cid: 'coinChart'
        });
    }



    return { subject, htmlContent, textContent, attachments };
}

// 發送包含圖表的郵件
async function sendEmailWithCharts(recipient, gameData) {
    try {
        const transporter = createEmailTransporter();
        const { subject, htmlContent, textContent, attachments } = await generateEmailContentWithCharts(gameData, recipient.name);

        const mailOptions = {
            from: `"🎮 遊戲數據系統" <${CONFIG.gmail.user}>`,
            to: recipient.email,
            subject: subject,
            text: textContent,
            html: htmlContent,
            attachments: attachments
        };

        console.log(`📤 正在發送包含圖表的郵件到 ${recipient.email} (${recipient.name})...`);

        const result = await transporter.sendMail(mailOptions);

        console.log(`✅ 成功發送到 ${recipient.email}`);

        // 記錄成功日誌
        // await logEmailResult({
        //     recipient: recipient.email,
        //     recipientName: recipient.name,
        //     success: true,
        //     timestamp: new Date().toISOString(),
        //     messageId: result.messageId,
        //     hasCharts: attachments.length > 0,
        //     chartCount: attachments.length,
        //     gameData: {
        //         date: gameData.date,
        //         totalGames: gameData.totalGames,
        //         clearRate: gameData.clearRate,
        //         isEmpty: gameData.isEmpty
        //     }
        // });

        return { success: true, messageId: result.messageId };

    } catch (error) {
        console.error(`❌ 發送到 ${recipient.email} 失敗:`, error.message);

        // 記錄失敗日誌
        // await logEmailResult({
        //     recipient: recipient.email,
        //     recipientName: recipient.name,
        //     success: false,
        //     error: error.message,
        //     timestamp: new Date().toISOString()
        // });

        throw error;
    }
}

// ===== 📝 日誌記錄 =====

// 記錄發送結果
async function logEmailResult(result) {
    try {
        let logs = [];

        try {
            const existingLogs = await fs.readFile(CONFIG.logFile, 'utf8');
            logs = JSON.parse(existingLogs);
        } catch (error) {
            // 檔案不存在或格式錯誤，使用空陣列
        }

        logs.push(result);

        // 只保留最近 500 筆記錄
        if (logs.length > 500) {
            logs = logs.slice(-500);
        }

        await fs.writeFile(CONFIG.logFile, JSON.stringify(logs, null, 2));

    } catch (error) {
        console.error('📝 寫入日誌失敗:', error.message);
    }
}

// ===== ⏰ 定時任務 =====

// 檢查並發送今日報告（包含圖表）
async function checkAndSendDailyReportsWithCharts() {
    try {
        const currentTime = getTaiwanTime();
        const today = getTaiwanToday();

        console.log(`\n⏰ 定時檢查 - 台灣時間: ${currentTime}, 日期: ${today}`);

        // 找出需要在當前時間發送的收件人
        const recipientsToSend = CONFIG.recipients.filter(recipient =>
            recipient.time === currentTime
        );

        if (recipientsToSend.length === 0) {
            return; // 沒有輸出，避免日誌過多
        }

        console.log(`📧 找到 ${recipientsToSend.length} 個收件人需要發送郵件`);

        // 獲取今日遊戲數據
        const gameData = await fetchGameData(today);

        // 依序發送給每個收件人
        const results = [];
        for (const recipient of recipientsToSend) {
            try {
                const result = await sendEmailWithCharts(recipient, gameData);
                results.push({ recipient: recipient.email, success: true });

                // 發送間隔，避免被 Gmail 限速
                await new Promise(resolve => setTimeout(resolve, 3000)); // 增加間隔時間，因為有圖表附件

            } catch (error) {
                results.push({ recipient: recipient.email, success: false, error: error.message });
            }
        }

        // 統計結果
        const successCount = results.filter(r => r.success).length;
        const failCount = results.length - successCount;

        console.log(`\n📊 發送結果統計:`);
        console.log(`✅ 成功: ${successCount} 封`);
        console.log(`❌ 失敗: ${failCount} 封`);

        if (failCount > 0) {
            console.log(`失敗的收件人:`, results.filter(r => !r.success).map(r => r.recipient));
        }

    } catch (error) {
        console.error('❌ 定時檢查失敗:', error.message);
    }
}

// 設置定時任務
function setupScheduler() {
    console.log('🚀 設置定時任務...');

    // 每分鐘檢查一次
    const job = schedule.scheduleJob('* * * * *', checkAndSendDailyReportsWithCharts);

    console.log('✅ 定時任務已設置，每分鐘檢查一次');
    console.log('📅 排程的發送時間:');
    CONFIG.recipients.forEach(recipient => {
        console.log(`   • ${recipient.time} → ${recipient.email} (${recipient.name})`);
    });

    return job;
}

// ===== 🛠️ 手動功能 =====

// 測試郵件系統（包含圖表）
async function testEmailSystemWithCharts() {
    try {
        console.log('🧪 測試帶圖表的郵件系統...');

        // 首先測試郵件服務器連線
        const transporter = createEmailTransporter();
        await transporter.verify();
        console.log('✅ Gmail 連線測試成功');

        // 測試數據獲取
        console.log('📊 測試數據獲取...');
        const testData = await fetchGameData();
        console.log(`📈 數據獲取測試完成: ${testData.totalGames} 場遊戲`);

        // 測試圖表生成
        console.log('🎨 測試圖表生成...');
        const clearRateChart = await createClearRateChart(testData);
        console.log('✅ 圖表生成測試成功');

        // 發送測試郵件給第一個收件人
        if (CONFIG.recipients.length > 0) {
            console.log(`📤 發送測試郵件到 ${CONFIG.recipients[0].email}...`);
            await sendEmailWithCharts(CONFIG.recipients[0], testData);
            console.log('✅ 測試郵件發送成功');
        } else {
            console.log('❌ 沒有設定收件人');
        }

    } catch (error) {
        console.error('❌ 測試失敗:', error.message);

        if (error.message.includes('Invalid login')) {
            console.log('💡 請檢查 Gmail 帳號和應用程式密碼是否正確');
        }
        if (error.message.includes('canvas')) {
            console.log('💡 請安裝 canvas 模組: npm install canvas');
        }
        if (error.message.includes('chart')) {
            console.log('💡 請安裝 chart.js: npm install chart.js');
        }
    }
}

// 手動發送今日報告（包含圖表）
async function sendTodayReportWithChartsManually() {
    try {
        console.log('📤 手動發送包含圖表的今日報告...');

        const gameData = await fetchGameData();

        for (const recipient of CONFIG.recipients) {
            await sendEmailWithCharts(recipient, gameData);
            await new Promise(resolve => setTimeout(resolve, 3000));
        }

        console.log(`✅ 手動發送完成，共發送 ${CONFIG.recipients.length} 封郵件`);

    } catch (error) {
        console.error('❌ 手動發送失敗:', error.message);
    }
}

// 顯示設定信息
function showConfig() {
    console.log('\n📋 當前設定:');
    console.log(`Gmail 帳號: ${CONFIG.gmail.user}`);
    console.log(`Gmail 密碼: ${CONFIG.gmail.pass ? '已設定' : '未設定'}`);
    console.log(`收件人數量: ${CONFIG.recipients.length}`);
    CONFIG.recipients.forEach((recipient, index) => {
        console.log(`  ${index + 1}. ${recipient.email} (${recipient.name}) - ${recipient.time}`);
    });
    console.log(`圖表設定: ${CONFIG.charts.width}x${CONFIG.charts.height}`);
    console.log(`時區: ${CONFIG.timezone}`);
    console.log(`當前台灣時間: ${new Date().toLocaleString('zh-TW', { timeZone: CONFIG.timezone })}`);
}

// ===== 🚀 主程式 =====

// 啟動系統
async function startEmailSystemWithCharts() {
    console.log('🚀 啟動 Node.js 自動郵件系統 (包含圖表)...');
    console.log(`📅 當前台灣時間: ${new Date().toLocaleString('zh-TW', { timeZone: CONFIG.timezone })}`);

    // 檢查設定
    if (!CONFIG.gmail.user || !CONFIG.gmail.pass) {
        console.error('❌ 請先設定 Gmail 帳號和應用程式密碼');
        console.log('💡 請修改 CONFIG.gmail 的設定');
        return;
    }

    showConfig();

    try {
        // 測試郵件設定
        console.log('\n🔍 驗證郵件設定...');
        const transporter = createEmailTransporter();
        await transporter.verify();
        console.log('✅ Gmail 連線驗證成功');

        // 測試數據獲取
        console.log('\n📊 測試數據獲取...');
        const testData = await fetchGameData();
        console.log(`✅ 數據獲取測試成功: ${testData.totalGames} 場遊戲 (${testData.isEmpty ? '無數據' : '有數據'})`);

        // 測試圖表生成
        // console.log('\n🎨 測試圖表生成...');
        // const testChart = await createHourlyPlayTimeChart(testData);
        // console.log('✅ 圖表生成測試成功');

        // 設置定時任務
        console.log('\n⏰ 設置定時任務...');
        setupScheduler();

        console.log('\n🎉 系統啟動成功！');
        console.log('💡 可用指令:');
        console.log('   • node auto-email-sender-with-charts.js --test    - 測試郵件功能');
        console.log('   • node auto-email-sender-with-charts.js --send    - 立即發送今日報告');
        console.log('   • node auto-email-sender-with-charts.js --config  - 顯示設定信息');
        console.log('   • Ctrl+C                                          - 停止系統');
        console.log('\n🔄 系統將持續運行，自動檢查發送時間...');
        console.log('📊 郵件將包含以下圖表:');
        console.log('   • 關卡通關率統計');
        console.log('   • 商品購買統計');
        console.log('   • 每日遊玩時數');
        console.log('   • 通關平均耗時統計');
        console.log('   • 平均步數統計');
        console.log('   • 平均扣血量統計');
        console.log('   • 遊戲綜合統計');

    } catch (error) {
        console.error('❌ 系統啟動失敗:', error.message);

        if (error.message.includes('Invalid login')) {
            console.log('\n💡 解決方法:');
            console.log('1. 確認 Gmail 帳號正確');
            console.log('2. 確認已啟用兩步驟驗證');
            console.log('3. 確認應用程式密碼正確 (16位數)');
            console.log('4. 檢查網路連線');
        }
        if (error.message.includes('canvas')) {
            console.log('\n💡 請安裝 canvas 模組:');
            console.log('npm install canvas');
        }

        process.exit(1);
    }
}

// 處理程式結束
process.on('SIGINT', () => {
    console.log('\n👋 正在關閉郵件系統...');
    schedule.gracefulShutdown().then(() => {
        console.log('✅ 系統已安全關閉');
        process.exit(0);
    });
});

// ===== 🎯 執行程式 =====

// 根據命令列參數執行不同功能
const args = process.argv.slice(2);

if (args.includes('--test')) {
    testEmailSystemWithCharts();
} else if (args.includes('--send')) {
    sendTodayReportWithChartsManually();
} else if (args.includes('--config')) {
    showConfig();
} else if (args.includes('--help')) {
    console.log(`
🎮 Node.js 自動郵件系統 (包含圖表) 使用說明

基本使用:
  node auto-email-sender-with-charts.js           # 啟動定時系統
  node auto-email-sender-with-charts.js --test    # 測試郵件功能  
  node auto-email-sender-with-charts.js --send    # 立即發送今日報告
  node auto-email-sender-with-charts.js --config  # 顯示當前設定
  node auto-email-sender-with-charts.js --help    # 顯示此幫助信息

系統依賴:
npm install nodemailer node-schedule node-fetch canvas

功能特色:
✅ 自動生成 5 種圖表
✅ 關卡通關率統計
✅ 商品購買圓餅圖
✅ 每小時遊玩時間分布
✅ 7天數據趨勢圖
✅ 遊戲綜合統計圖表
✅ 響應式 HTML 郵件設計
✅ 詳細數據表格

設定說明:
1. 修改 CONFIG.gmail.user 和 CONFIG.gmail.pass
2. 修改 CONFIG.recipients 添加收件人
3. 設定每個收件人的發送時間 (24小時制)
4. 可調整 CONFIG.charts 的圖表尺寸設定

Gmail 應用程式密碼設定:
1. 前往 Google 帳戶設定
2. 啟用兩步驟驗證
3. 生成應用程式密碼 (選擇「郵件」)
4. 將 16 位數密碼填入 CONFIG.gmail.pass

範例設定:
CONFIG.gmail.user = 'your-email@gmail.com';
CONFIG.gmail.pass = 'abcd efgh ijkl mnop';
CONFIG.recipients = [
  { email: 'boss@company.com', time: '09:00', name: '老闆' },
  { email: 'manager@company.com', time: '18:00', name: '主管' }
];
  `);
} else {
    startEmailSystemWithCharts();
}

// 匯出功能供其他模組使用
module.exports = {
    checkAndSendDailyReportsWithCharts,
    fetchGameData,
    fetchAvailableDates,
    fetchHistoricalDataFromSheets,
    sendEmail: sendEmailWithCharts, // 導出為 sendEmail 以保持兼容性
    sendEmailWithCharts,
    sendTodayReportWithChartsManually,
    testEmailSystemWithCharts,
    startEmailSystemWithCharts,
    createClearRateChart,
    createItemPurchaseChart,
    // createHourlyPlayTimeChart, // 保持原函數名，但功能是每日遊玩時數
    createClearTimeTrendChart,
    createAverageStepsChart, // 新增平均步數圖表
    createAverageDamageChart, // 新增平均扣血量圖表
    createSummaryChart,
    generateEmailContentWithCharts,
    createEmailTransporter,
    formatTime, // 輔助函數
    CONFIG
};