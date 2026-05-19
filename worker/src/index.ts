/**
 * LeadGen Worker
 *
 * Standalone process managing two independent market pipelines:
 * - Uganda (UG): EAT timezone schedule
 * - United States (US): UTC schedule (EST business hours)
 *
 * Each market has its own:
 * - Scrape cron
 * - Dispatch crons (morning / lunch / evening)
 * - WhatsApp bot session
 * - Firestore status doc
 * - Independent on/off toggle
 */

import express from 'express';
import cors from 'cors';
import cron from 'node-cron';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Try multiple paths for .env file
const envPaths = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(__dirname, '../../.env'),
    path.resolve(__dirname, '../../../.env'),
    path.resolve(__dirname, '../../../../.env'),
];

for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
        dotenv.config({ path: envPath });
        console.log(`Loaded .env from: ${envPath}`);
        break;
    }
}

import { initializeFirebase, getWorkerStatus, updateWorkerStatus } from './firebase';
import { runScrape } from './scrape-runner';
import { runDispatch, runBacklogDispatch } from './dispatch-runner';
import { getDispatchConfig, updateDispatchConfig } from './config-manager';
import type { Market } from '../../shared/types';

const app = express();
const PORT = process.env.WORKER_PORT || 4000;

// Middleware
app.use(cors());
app.use(express.json());

// ============================================
// DISPATCH LOCKS (per market)
// ============================================

const dispatchState: Record<Market, { inProgress: boolean; currentWindow: string | null }> = {
    UG: { inProgress: false, currentWindow: null },
    US: { inProgress: false, currentWindow: null },
};

// ============================================
// LOGGING
// ============================================

const logs: Array<{ timestamp: string; level: string; message: string }> = [];
const addLog = (level: string, message: string) => {
    const entry = { timestamp: new Date().toISOString(), level, message };
    logs.unshift(entry);
    if (logs.length > 100) logs.pop();
    console.log(`[${level.toUpperCase()}] ${message}`);
};

// ============================================
// HELPERS
// ============================================

function parseMarket(raw?: string): Market {
    return raw === 'US' ? 'US' : 'UG';
}

/** Convert EAT hour to UTC cron — EAT = UTC+3 */
function eatToUtcCron(hour: number, minute: number): string {
    let utcHour = hour - 3;
    if (utcHour < 0) utcHour += 24;
    return `${minute} ${utcHour} * * *`;
}

/** UTC cron expression directly (for US market which stores UTC) */
function utcCron(hour: number, minute: number): string {
    return `${minute} ${hour} * * *`;
}

/** Determine current dispatch window from UTC hour */
function detectWindow(utcHour: number, market: Market): 'morning' | 'lunch' | 'evening' {
    if (market === 'US') {
        // US windows in UTC: morning=14, lunch=17, evening=23
        if (utcHour >= 14 && utcHour < 17) return 'morning';
        if (utcHour >= 17 && utcHour < 23) return 'lunch';
        return 'evening';
    }
    // UG windows in EAT = UTC+3
    const eatHour = (utcHour + 3) % 24;
    if (eatHour >= 5 && eatHour < 12) return 'morning';
    if (eatHour >= 12 && eatHour < 17) return 'lunch';
    return 'evening';
}

// ============================================
// STATUS API
// ============================================

app.get('/status', async (req, res) => {
    try {
        const workerData = await getWorkerStatus();
        res.json({ alive: true, uptime: process.uptime(), ...workerData });
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
// MANUAL TRIGGERS — SCRAPE
// ============================================

app.post('/trigger/scrape', async (req, res) => {
    const { location, limit, businessType, market: rawMarket } = req.body;
    const market = parseMarket(rawMarket);

    const params = [];
    if (market !== 'UG') params.push(`Market: ${market}`);
    if (location) params.push(`Target: ${location}`);
    if (businessType) params.push(`Type: ${businessType}`);
    if (limit) params.push(`Limit: ${limit}`);
    const paramStr = params.length > 0 ? ` (${params.join(', ')})` : '';

    addLog('info', `Manual scrape triggered${paramStr}`);

    try {
        const result = await runScrape(addLog, {
            targetLocation: location,
            targetBusinessType: businessType,
            limit: limit ? Number(limit) : undefined,
            market,
        });
        res.json({ success: true, result });
    } catch (error: any) {
        addLog('error', `Scrape failed: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// MANUAL TRIGGERS — DISPATCH
// ============================================

app.post('/trigger/dispatch/:window', async (req, res) => {
    const window = req.params.window as 'morning' | 'lunch' | 'evening';
    const { filters, market: rawMarket } = req.body;
    const market = parseMarket(rawMarket);

    if (!['morning', 'lunch', 'evening'].includes(window)) {
        return res.status(400).json({ error: 'Invalid window' });
    }

    const state = dispatchState[market];
    if (state.inProgress) {
        addLog('warning', `[${market}] Dispatch rejected - already running for ${state.currentWindow}`);
        return res.status(409).json({ error: `[${market}] Dispatch already in progress for ${state.currentWindow}` });
    }

    const filterLog = filters ? ` (Filters: ${JSON.stringify(filters)})` : '';
    addLog('info', `[${market}] Manual dispatch triggered for ${window}${filterLog}`);

    state.inProgress = true;
    state.currentWindow = window;

    try {
        const result = await runDispatch(window, addLog, { filters, market });
        res.json({ success: true, result });
    } catch (error: any) {
        addLog('error', `[${market}] Dispatch failed: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    } finally {
        state.inProgress = false;
        state.currentWindow = null;
    }
});

app.post('/trigger/dispatch-current', async (req, res) => {
    const { market: rawMarket } = req.body || {};
    const market = parseMarket(rawMarket);
    const state = dispatchState[market];

    if (state.inProgress) {
        return res.status(409).json({ error: `[${market}] Dispatch already in progress for ${state.currentWindow}` });
    }

    const now = new Date();
    const window = detectWindow(now.getUTCHours(), market);

    addLog('info', `[${market}] ▶️ Resume dispatch for ${window} window (auto-detected)`);
    state.inProgress = true;
    state.currentWindow = window;

    try {
        const result = await runDispatch(window, addLog, { market });
        res.json({ success: true, window, result });
    } catch (error: any) {
        addLog('error', `[${market}] Dispatch failed: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    } finally {
        state.inProgress = false;
        state.currentWindow = null;
    }
});

app.post('/trigger/dispatch-backlog', async (req, res) => {
    const { market: rawMarket } = req.body || {};
    const market = parseMarket(rawMarket);
    const state = dispatchState[market];

    if (state.inProgress) {
        return res.status(409).json({ error: `[${market}] Dispatch already in progress for ${state.currentWindow}` });
    }

    const limit = parseInt(req.query.limit as string) || 30;
    const window = detectWindow(new Date().getUTCHours(), market);

    addLog('info', `[${market}] 📦 Backlog-only dispatch triggered (limit: ${limit}, window: ${window})`);
    state.inProgress = true;
    state.currentWindow = 'backlog';

    try {
        const result = await runBacklogDispatch(window, addLog, limit, market);
        res.json({ window, ...result });
    } catch (error: any) {
        addLog('error', `[${market}] Backlog dispatch failed: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    } finally {
        state.inProgress = false;
        state.currentWindow = null;
    }
});

// ============================================
// CONFIGURATION
// ============================================

app.get('/config/dispatch', async (req, res) => {
    const market = parseMarket(req.query.market as string);
    try {
        const config = await getDispatchConfig(market);
        res.json(config);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/config/dispatch', async (req, res) => {
    const market = parseMarket(req.query.market as string);
    try {
        const updates = req.body;
        const config = await updateDispatchConfig(market, updates);
        res.json({ success: true, config });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// BOT SESSION CONTROL
// ============================================

app.post('/bot/stop', async (req, res) => {
    const market = parseMarket(req.query.market as string);
    try {
        const { getDb } = await import('./firebase');
        const db = getDb();
        const docId = market === 'US' ? 'bot_status_US' : 'bot_status';
        await db.collection('system').doc(docId).set({ status: 'stopped' }, { merge: true });
        res.json({ success: true, market });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/bot/pause', async (req, res) => {
    const market = parseMarket(req.query.market as string);
    try {
        const { getDb } = await import('./firebase');
        const db = getDb();
        const docId = market === 'US' ? 'bot_status_US' : 'bot_status';
        await db.collection('system').doc(docId).set({ status: 'paused' }, { merge: true });
        res.json({ success: true, market });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/bot/resume', async (req, res) => {
    const market = parseMarket(req.query.market as string);
    try {
        const { getDb } = await import('./firebase');
        const db = getDb();
        const docId = market === 'US' ? 'bot_status_US' : 'bot_status';
        await db.collection('system').doc(docId).set({ status: 'running' }, { merge: true });
        res.json({ success: true, market });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// TEST ENDPOINTS
// ============================================

app.post('/trigger/test-scrape', async (req, res) => {
    const market = parseMarket(req.body?.market);
    addLog('info', `🧪 TEST scrape triggered (3 leads, market: ${market})`);
    try {
        const result = await runScrape(addLog, { limit: 3, market });
        res.json({ success: true, result });
    } catch (error: any) {
        addLog('error', `Test scrape failed: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/trigger/test-dispatch', async (req, res) => {
    const market = parseMarket(req.body?.market);
    addLog('info', `🧪 TEST dispatch triggered (3 messages, market: ${market})`);
    try {
        const result = await runDispatch('morning', addLog, { limit: 3, market });
        res.json({ success: true, result });
    } catch (error: any) {
        addLog('error', `Test dispatch failed: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

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
// CRON SCHEDULING
// ============================================

const scheduledTasks: cron.ScheduledTask[] = [];

async function scheduleCronJobs() {
    const { getSystemSettings } = await import('./firebase');
    const settings = await getSystemSettings();

    // Clear existing tasks
    scheduledTasks.forEach(task => task.stop());
    scheduledTasks.length = 0;

    // --- UGANDA CRONS (EAT → UTC) ---
    const ugCrons = settings.cronTimes;

    scheduledTasks.push(cron.schedule(eatToUtcCron(ugCrons.scrape.hour, ugCrons.scrape.minute), async () => {
        const currentSettings = await getSystemSettings();
        if (!currentSettings.ugEnabled || !currentSettings.scrapeEnabled) {
            addLog('warning', '⏸️ [UG] Scrape skipped - disabled');
            return;
        }
        addLog('info', `⏰ [UG] Scrape cron triggered`);
        try { await runScrape(addLog, { market: 'UG' }); }
        catch (e: any) { addLog('error', `[UG] Scrape cron failed: ${e.message}`); }
    }, { timezone: 'UTC' }));

    const ugWindows: Array<['morning' | 'lunch' | 'evening', { hour: number; minute: number }]> = [
        ['morning', ugCrons.morning],
        ['lunch', ugCrons.lunch],
        ['evening', ugCrons.evening],
    ];

    for (const [window, time] of ugWindows) {
        scheduledTasks.push(cron.schedule(eatToUtcCron(time.hour, time.minute), async () => {
            const currentSettings = await getSystemSettings();
            if (!currentSettings.ugEnabled || !currentSettings.dispatchEnabled) {
                addLog('warning', `⏸️ [UG] ${window} dispatch skipped - disabled`);
                return;
            }
            const state = dispatchState['UG'];
            if (state.inProgress) {
                addLog('warning', `[UG] ${window} dispatch skipped - already running`);
                return;
            }
            addLog('info', `⏰ [UG] ${window} dispatch cron triggered`);
            state.inProgress = true;
            state.currentWindow = window;
            try { await runDispatch(window, addLog, { market: 'UG' }); }
            catch (e: any) { addLog('error', `[UG] ${window} dispatch failed: ${e.message}`); }
            finally { state.inProgress = false; state.currentWindow = null; }
        }, { timezone: 'UTC' }));
    }

    // --- US CRONS (UTC directly) ---
    const usCrons = settings.usCronTimes;

    scheduledTasks.push(cron.schedule(utcCron(usCrons.scrape.hour, usCrons.scrape.minute), async () => {
        const currentSettings = await getSystemSettings();
        if (!currentSettings.usEnabled || !currentSettings.usScrapeEnabled) {
            addLog('warning', '⏸️ [US] Scrape skipped - disabled');
            return;
        }
        addLog('info', `⏰ [US] Scrape cron triggered`);
        try { await runScrape(addLog, { market: 'US' }); }
        catch (e: any) { addLog('error', `[US] Scrape cron failed: ${e.message}`); }
    }, { timezone: 'UTC' }));

    const usWindows: Array<['morning' | 'lunch' | 'evening', { hour: number; minute: number }]> = [
        ['morning', usCrons.morning],
        ['lunch', usCrons.lunch],
        ['evening', usCrons.evening],
    ];

    for (const [window, time] of usWindows) {
        scheduledTasks.push(cron.schedule(utcCron(time.hour, time.minute), async () => {
            const currentSettings = await getSystemSettings();
            if (!currentSettings.usEnabled || !currentSettings.usDispatchEnabled) {
                addLog('warning', `⏸️ [US] ${window} dispatch skipped - disabled`);
                return;
            }
            const state = dispatchState['US'];
            if (state.inProgress) {
                addLog('warning', `[US] ${window} dispatch skipped - already running`);
                return;
            }
            addLog('info', `⏰ [US] ${window} dispatch cron triggered`);
            state.inProgress = true;
            state.currentWindow = window;
            try { await runDispatch(window, addLog, { market: 'US' }); }
            catch (e: any) { addLog('error', `[US] ${window} dispatch failed: ${e.message}`); }
            finally { state.inProgress = false; state.currentWindow = null; }
        }, { timezone: 'UTC' }));
    }

    // Log scheduled times
    addLog('info', '📅 Cron jobs scheduled:');
    addLog('info', `  🇺🇬 UG Scrape: ${ugCrons.scrape.hour}:${String(ugCrons.scrape.minute).padStart(2, '0')} EAT`);
    addLog('info', `  🇺🇬 UG Morning: ${ugCrons.morning.hour}:${String(ugCrons.morning.minute).padStart(2, '0')} EAT`);
    addLog('info', `  🇺🇬 UG Lunch: ${ugCrons.lunch.hour}:${String(ugCrons.lunch.minute).padStart(2, '0')} EAT`);
    addLog('info', `  🇺🇬 UG Evening: ${ugCrons.evening.hour}:${String(ugCrons.evening.minute).padStart(2, '0')} EAT`);
    addLog('info', `  🇺🇸 US Scrape: ${usCrons.scrape.hour}:${String(usCrons.scrape.minute).padStart(2, '0')} UTC`);
    addLog('info', `  🇺🇸 US Morning: ${usCrons.morning.hour}:${String(usCrons.morning.minute).padStart(2, '0')} UTC`);
    addLog('info', `  🇺🇸 US Lunch: ${usCrons.lunch.hour}:${String(usCrons.lunch.minute).padStart(2, '0')} UTC`);
    addLog('info', `  🇺🇸 US Evening: ${usCrons.evening.hour}:${String(usCrons.evening.minute).padStart(2, '0')} UTC`);
}

// ============================================
// RESCHEDULE ENDPOINT
// ============================================

app.post('/reschedule', async (req, res) => {
    addLog('info', '🔄 Rescheduling cron jobs...');
    try {
        await scheduleCronJobs();
        res.json({ success: true, message: 'Cron jobs rescheduled' });
    } catch (error: any) {
        addLog('error', `Reschedule failed: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// STARTUP
// ============================================

async function start() {
    addLog('info', 'Initializing Firebase...');
    await initializeFirebase();

    await updateWorkerStatus({
        status: 'running',
        startedAt: new Date().toISOString(),
    });

    await scheduleCronJobs();

    app.listen(PORT, () => {
        addLog('info', `🚀 Worker server running on port ${PORT}`);
    });
}

start().catch((error) => {
    console.error('Failed to start worker:', error);
    process.exit(1);
});
