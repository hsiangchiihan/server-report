const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const bodyParser = require('body-parser');
const cors = require('cors');
const cron = require('node-cron');
const nodemailer = require('nodemailer');
const path = require('path');

// ✅ 修正匯入 - 只匯入存在的函數
const { 
    sendEmail, 
    fetchGameData,
    sendTodayReportManually,
    testEmailSystem,
    CONFIG
} = require('./auto-email-sender');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// 中間件設置
app.use(cors());
app.use(bodyParser.json());
app.use(express.json());
app.use(express.static(path.join(__dirname, '.')));

// 全域變數
let scheduledJobs = [];
let latestPlayerData = {};
const registeredJobs = {};

// ===== 📧 Email 相關 API =====

// 觸發報告發送
app.post('/trigger-report', async (req, res) => {
    const { to, to_name } = req.body;

    if (!to) {
        return res.status(400).json({ success: false, error: '缺少收件人 email' });
    }

    const recipient = {
        email: to,
        name: to_name || to.split('@')[0],
        time: '手動觸發'
    };

    try {
        const gameData = await fetchGameData(); // 📊 取得遊戲數據
        await sendEmail(recipient, gameData);   // 📧 發送信件

        res.json({ success: true, message: '報告已發送' });
    } catch (error) {
        console.error('❌ 發送錯誤:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});


// 發送測試郵件
app.post('/send-test-email', async (req, res) => {
    try {
        console.log('🧪 發送測試郵件...');
        
        const recipient = {
            name: req.body.to_name || '測試用戶',
            email: req.body.to || req.body.email
        };

        if (!recipient.email) {
            return res.status(400).json({ 
                success: false, 
                error: '缺少收件人 Email 地址' 
            });
        }

        // 獲取遊戲數據
        const gameData = await fetchGameData();
        
        // 發送郵件
        const result = await sendEmail(recipient, gameData);

        console.log(`✅ 測試郵件發送成功: ${recipient.email}`);
        res.json({ 
            success: true, 
            message: `測試郵件已發送到 ${recipient.email}`,
            result 
        });

    } catch (err) {
        console.error('❌ 測試郵件發送失敗:', err);
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// 註冊定時 Email 任務
app.post('/api/emails', (req, res) => {
    try {
        const { address, time, autoSend } = req.body;

        if (!address || !time || autoSend === undefined) {
            return res.status(400).json({ 
                success: false, 
                message: '缺少必要參數：address, time, autoSend' 
            });
        }

        // 驗證 Email 格式
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(address)) {
            return res.status(400).json({ 
                success: false, 
                message: '無效的 Email 格式' 
            });
        }

        // 驗證時間格式 (HH:MM)
        const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
        if (!timeRegex.test(time)) {
            return res.status(400).json({ 
                success: false, 
                message: '無效的時間格式，請使用 HH:MM' 
            });
        }

        const [hour, minute] = time.split(':');
        const cronTime = `${minute} ${hour} * * *`; // 每日固定時間

        // 如果該 Email 已註冊，先停止舊任務
        if (registeredJobs[address]) {
            registeredJobs[address].destroy();
            delete registeredJobs[address];
            console.log(`🛑 停止舊任務: ${address}`);
        }

        // 只有啟用自動發送才註冊任務
        if (autoSend) {
            const job = cron.schedule(cronTime, async () => {
                try {
                    console.log(`⏰ 自動發送郵件給: ${address} (${time})`);
                    
                    const recipient = { name: address.split('@')[0], email: address };
                    const gameData = await fetchGameData();
                    await sendEmail(recipient, gameData);
                    
                    console.log(`✅ 自動郵件發送成功: ${address}`);
                } catch (error) {
                    console.error(`❌ 自動郵件發送失敗 ${address}:`, error.message);
                }
            }, {
                scheduled: true,
                timezone: "Asia/Taipei"
            });

            registeredJobs[address] = job;
        }

        console.log(`✅ ${autoSend ? '註冊' : '保存'}定時任務:`);
        console.log(`   📧 Email: ${address}`);
        console.log(`   🕘 時間: ${time}`);
        console.log(`   🗓 Cron: ${cronTime}`);
        console.log(`   🔁 狀態: ${autoSend ? '已啟用' : '未啟用'}`);

        res.json({ 
            success: true,
            message: `${autoSend ? '已註冊自動發送任務' : '設定已保存'}`,
            cronTime: autoSend ? cronTime : null
        });

    } catch (err) {
        console.error('❌ 註冊 Email 任務失敗:', err);
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// 刪除 Email 任務
app.delete('/api/emails/:email', (req, res) => {
    try {
        const email = decodeURIComponent(req.params.email);
        
        if (registeredJobs[email]) {
            registeredJobs[email].destroy();
            delete registeredJobs[email];
            console.log(`🗑️ 已刪除任務: ${email}`);
            
            res.json({ 
                success: true, 
                message: `已刪除 ${email} 的定時任務` 
            });
        } else {
            res.json({ 
                success: true, 
                message: `${email} 沒有註冊的任務` 
            });
        }
    } catch (err) {
        console.error('❌ 刪除任務失敗:', err);
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// 測試郵件系統
app.post('/api/test-email-system', async (req, res) => {
    try {
        console.log('🧪 測試郵件系統...');
        await testEmailSystem();
        res.json({ 
            success: true, 
            message: '郵件系統測試完成，請查看控制台日誌' 
        });
    } catch (err) {
        console.error('❌ 郵件系統測試失敗:', err);
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// ===== 🎮 遊戲數據相關 API =====

// 獲取最新玩家數據
app.get('/api/latest', (req, res) => {
    res.json(Object.values(latestPlayerData));
});

// 接收遊戲數據 Webhook
app.post('/webhook', (req, res) => {
    const data = req.body;
    const { playerId } = data;

    if (!playerId) {
        return res.status(400).json({ error: 'Missing playerId' });
    }

    // 過濾重複的舊數據
    const newTime = new Date(data.timestamp);
    const existingData = latestPlayerData[playerId];

    if (!existingData || newTime > new Date(existingData.timestamp)) {
        latestPlayerData[playerId] = data;

        // 推送新數據到所有 WebSocket 客戶端
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ 
                    type: 'update', 
                    data 
                }));
            }
        });

        console.log(`📊 收到新遊戲數據: ${playerId} - ${data.timestamp}`);
    } else {
        console.log(`⏳ 忽略舊數據: ${playerId} - ${data.timestamp}`);
    }

    res.json({ status: 'received' });
});

// ===== 🔌 WebSocket 處理 =====

wss.on('connection', (ws) => {
    console.log('🔌 新的 WebSocket 連接');
    
    // 發送最近的數據給新連接的客戶端
    const now = Date.now();
    const recentData = Object.values(latestPlayerData).filter(player =>
        now - (player._lastUpdated || 0) < 2000 // 2 秒內的數據
    );

    ws.send(JSON.stringify({
        type: 'init',
        data: recentData
    }));

    ws.on('close', () => {
        console.log('🔌 WebSocket 連接已關閉');
    });
});

// ===== 🚀 啟動服務器 =====

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`🚀 伺服器啟動成功！`);
    console.log(`📍 地址: http://localhost:${PORT}`);
    console.log(`📧 Email 系統已載入`);
    console.log(`🎮 遊戲數據接收器已啟動`);
    console.log(`🔌 WebSocket 伺服器已啟動`);
    
    // 顯示當前 Email 設定
    if (CONFIG.recipients && CONFIG.recipients.length > 0) {
        console.log(`\n📋 預設收件人:`);
        CONFIG.recipients.forEach((recipient, index) => {
            console.log(`   ${index + 1}. ${recipient.email} (${recipient.name}) - ${recipient.time}`);
        });
    } else {
        console.log(`\n⚠️ 尚未設定預設收件人，請透過 API 註冊`);
    }
});

// 優雅關閉處理
process.on('SIGINT', () => {
    console.log('\n👋 正在關閉伺服器...');
    
    // 停止所有定時任務
    Object.values(registeredJobs).forEach(job => {
        job.destroy();
    });
    
    console.log('✅ 所有定時任務已停止');
    console.log('✅ 伺服器已安全關閉');
    process.exit(0);
});