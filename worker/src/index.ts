/**
 * LeadGen Worker
 * 
 * Standalone process for:
 * - Scraping leads (5 AM daily)
 * - Dispatching messages (6:30 AM, 12:30 PM, 7:30 PM)
 * - Running WhatsApp bot
 * - Providing status API
 */

import express from 'express';
import cors from 'cors';
import cron from 'node-cron';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from parent directory
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { initializeFirebase, getWorkerStatus, updateWorkerStatus } from './firebase';
import { runScrape } from './scrape-runner';
import { runDispatch } from './dispatch-runner';

const app = express();
const PORT = process.env.WORKER_PORT || 4000;

// Middleware
app.use(cors());
app.use(express.json());

// In-memory logs (last 100)
const logs: Array<{ timestamp: string; level: string; message: string }> = [];
const addLog = (level: string, message: string) => {
    const entry = { timestamp: new Date().toISOString(), level, message };
    logs.unshift(entry);
    if (logs.length > 100) logs.pop();
    console.log(`[${level.toUpperCase()}] ${message}`);
};

// ============================================
// STATUS API
// ============================================

app.get('/status', async (req, res) => {
    try {
        const workerData = await getWorkerStatus();
        res.json({
            alive: true,
            uptime: process.uptime(),
            ...workerData,
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/logs', (req, res) => {
    const limit = parseInt(req.query.limit as string) || 50;
    res.json(logs.slice(0, limit));
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============================================
// MANUAL TRIGGERS
// ============================================

app.post('/trigger/scrape', async (req, res) => {
    addLog('info', 'Manual scrape triggered');
    try {
        const result = await runScrape(addLog);
        res.json({ success: true, result });
    } catch (error: any) {
        addLog('error', `Scrape failed: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/trigger/dispatch/:window', async (req, res) => {
    const window = req.params.window as 'morning' | 'lunch' | 'evening';
    if (!['morning', 'lunch', 'evening'].includes(window)) {
        return res.status(400).json({ error: 'Invalid window' });
    }

    addLog('info', `Manual dispatch triggered for ${window}`);
    try {
        const result = await runDispatch(window, addLog);
        res.json({ success: true, result });
    } catch (error: any) {
        addLog('error', `Dispatch failed: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Resume dispatch for current time window (auto-detect)
app.post('/trigger/dispatch-current', async (req, res) => {
    // Determine current window based on EAT time (UTC+3)
    const now = new Date();
    const eatHour = (now.getUTCHours() + 3) % 24;

    let window: 'morning' | 'lunch' | 'evening';
    if (eatHour >= 5 && eatHour < 12) {
        window = 'morning';
    } else if (eatHour >= 12 && eatHour < 17) {
        window = 'lunch';
    } else {
        window = 'evening';
    }

    addLog('info', `▶️ Resume dispatch for ${window} window (auto-detected, ${eatHour}:00 EAT)`);
    try {
        const result = await runDispatch(window, addLog);
        res.json({ success: true, window, result });
    } catch (error: any) {
        addLog('error', `Dispatch failed: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// TEST ENDPOINTS (Small batches for testing)
// ============================================

app.post('/trigger/test-scrape', async (req, res) => {
    addLog('info', '🧪 TEST scrape triggered (3 leads only)');
    try {
        const result = await runScrape(addLog, 3); // Pass limit
        res.json({ success: true, result });
    } catch (error: any) {
        addLog('error', `Test scrape failed: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/trigger/test-dispatch', async (req, res) => {
    addLog('info', '🧪 TEST dispatch triggered (3 messages only)');
    try {
        const result = await runDispatch('morning', addLog, 3); // Pass limit
        res.json({ success: true, result });
    } catch (error: any) {
        addLog('error', `Test dispatch failed: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Test Telegram notification
app.post('/trigger/test-telegram', async (req, res) => {
    try {
        const { sendTestNotification } = await import('./telegram');
        const success = await sendTestNotification();
        res.json({ success, message: success ? 'Check Telegram!' : 'Failed to send' });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// CRON JOBS (EAT = UTC+3)
// ============================================

// 5:00 AM EAT = 2:00 AM UTC - Daily scrape (300 leads)
cron.schedule('0 2 * * *', async () => {
    addLog('info', '⏰ Scrape cron triggered (5:00 AM EAT)');
    try {
        await runScrape(addLog);
    } catch (error: any) {
        addLog('error', `Scrape cron failed: ${error.message}`);
    }
}, { timezone: 'UTC' });

// TEMPORARY TEST: 11:15 PM EAT = 20:15 UTC
cron.schedule('15 20 * * *', async () => {
    addLog('info', '⏰ TEST Scrape cron triggered (11:15 PM EAT)');
    try {
        await runScrape(addLog);
    } catch (error: any) {
        addLog('error', `Test scrape cron failed: ${error.message}`);
    }
}, { timezone: 'UTC' });

// CRITICAL TEST: 3:00 AM EAT = 00:00 UTC
cron.schedule('0 0 * * *', async () => {
    addLog('info', '⏰ TEST Dispatch cron triggered (3:00 AM EAT)');
    try {
        await runDispatch('morning', addLog);
    } catch (error: any) {
        addLog('error', `Test dispatch failed: ${error.message}`);
    }
}, { timezone: 'UTC' });

// 6:30 AM EAT = 3:30 AM UTC
cron.schedule('30 3 * * *', async () => {
    addLog('info', '⏰ Morning dispatch cron triggered (6:30 AM EAT)');
    try {
        await runDispatch('morning', addLog);
    } catch (error: any) {
        addLog('error', `Morning dispatch failed: ${error.message}`);
    }
}, { timezone: 'UTC' });

// 1:05 PM EAT = 10:05 AM UTC
cron.schedule('5 10 * * *', async () => {
    addLog('info', '⏰ Lunch dispatch cron triggered (1:05 PM EAT)');
    try {
        await runDispatch('lunch', addLog);
    } catch (error: any) {
        addLog('error', `Lunch dispatch failed: ${error.message}`);
    }
}, { timezone: 'UTC' });

// 7:30 PM EAT = 4:30 PM UTC
cron.schedule('30 16 * * *', async () => {
    addLog('info', '⏰ Evening dispatch cron triggered (7:30 PM EAT)');
    try {
        await runDispatch('evening', addLog);
    } catch (error: any) {
        addLog('error', `Evening dispatch failed: ${error.message}`);
    }
}, { timezone: 'UTC' });

// ============================================
// STARTUP
// ============================================

async function start() {
    addLog('info', 'Initializing Firebase...');
    await initializeFirebase();

    await updateWorkerStatus({
        status: 'running',
        startedAt: new Date().toISOString()
    });

    app.listen(PORT, () => {
        addLog('info', `🚀 Worker server running on port ${PORT}`);
        addLog('info', 'Cron jobs scheduled:');
        addLog('info', '  - Scrape: 5:00 AM EAT');
        addLog('info', '  - Morning dispatch: 6:30 AM EAT');
        addLog('info', '  - Lunch dispatch: 12:30 PM EAT');
        addLog('info', '  - Evening dispatch: 7:30 PM EAT');
    });
}

start().catch((error) => {
    console.error('Failed to start worker:', error);
    process.exit(1);
});
