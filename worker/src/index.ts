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
import fs from 'fs';

// Try multiple paths for .env file
const envPaths = [
    path.resolve(process.cwd(), '.env'),  // Current working directory
    path.resolve(__dirname, '../../../.env'),  // worker/.env from dist/worker/src
    path.resolve(__dirname, '../../../../.env'),  // project root from dist/worker/src
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

const app = express();
const PORT = process.env.WORKER_PORT || 4000;

// Middleware
app.use(cors());
app.use(express.json());

// Dispatch lock - prevents concurrent dispatches
let dispatchInProgress = false;
let currentDispatchWindow: string | null = null;

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
    const { location } = req.body;
    addLog('info', `Manual scrape triggered${location ? ` (Target: ${location})` : ''}`);
    try {
        const result = await runScrape(addLog, { targetLocation: location });
        res.json({ success: true, result });
    } catch (error: any) {
        addLog('error', `Scrape failed: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/trigger/dispatch/:window', async (req, res) => {
    const window = req.params.window as 'morning' | 'lunch' | 'evening';
    const { filters } = req.body; // Extract filters

    if (!['morning', 'lunch', 'evening'].includes(window)) {
        return res.status(400).json({ error: 'Invalid window' });
    }

    // Check dispatch lock
    if (dispatchInProgress) {
        addLog('warning', `Dispatch rejected - already running for ${currentDispatchWindow}`);
        return res.status(409).json({ error: `Dispatch already in progress for ${currentDispatchWindow}` });
    }

    // Log filters if present
    const filterLog = filters ? ` (Filters: ${JSON.stringify(filters)})` : '';
    addLog('info', `Manual dispatch triggered for ${window}${filterLog}`);

    dispatchInProgress = true;
    currentDispatchWindow = window;

    try {
        const result = await runDispatch(window, addLog, { filters });
        res.json({ success: true, result });
    } catch (error: any) {
        addLog('error', `Dispatch failed: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    } finally {
        dispatchInProgress = false;
        currentDispatchWindow = null;
    }
});

// Resume dispatch for current time window (auto-detect)
app.post('/trigger/dispatch-current', async (req, res) => {
    // Check dispatch lock first
    if (dispatchInProgress) {
        addLog('warning', `Dispatch rejected - already running for ${currentDispatchWindow}`);
        return res.status(409).json({ error: `Dispatch already in progress for ${currentDispatchWindow}` });
    }

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
    dispatchInProgress = true;
    currentDispatchWindow = window;

    try {
        const result = await runDispatch(window, addLog);
        res.json({ success: true, window, result });
    } catch (error: any) {
        addLog('error', `Dispatch failed: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    } finally {
        dispatchInProgress = false;
        currentDispatchWindow = null;
    }
});

// Dispatch ONLY backlog leads (skip fresh leads)
app.post('/trigger/dispatch-backlog', async (req, res) => {
    // Check dispatch lock first
    if (dispatchInProgress) {
        addLog('warning', `Backlog dispatch rejected - already running for ${currentDispatchWindow}`);
        return res.status(409).json({ error: `Dispatch already in progress for ${currentDispatchWindow}` });
    }

    const limit = parseInt(req.query.limit as string) || 30;

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

    addLog('info', `📦 Backlog-only dispatch triggered (limit: ${limit}, window: ${window})`);
    dispatchInProgress = true;
    currentDispatchWindow = 'backlog';

    try {
        const result = await runBacklogDispatch(window, addLog, limit);
        res.json({ window, ...result });
    } catch (error: any) {
        addLog('error', `Backlog dispatch failed: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    } finally {
        dispatchInProgress = false;
        currentDispatchWindow = null;
    }
});

// ============================================
// TEST ENDPOINTS (Small batches for testing)
// ============================================

app.post('/trigger/test-scrape', async (req, res) => {
    addLog('info', '🧪 TEST scrape triggered (3 leads only)');
    try {
        const result = await runScrape(addLog, { limit: 3 }); // Pass limit
        res.json({ success: true, result });
    } catch (error: any) {
        addLog('error', `Test scrape failed: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/trigger/test-dispatch', async (req, res) => {
    addLog('info', '🧪 TEST dispatch triggered (3 messages only)');
    try {
        const result = await runDispatch('morning', addLog, { limit: 3 }); // Pass limit
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
// CRON JOBS (Dynamic from Settings)
// ============================================

// Convert EAT time to UTC cron expression
function eatToUtcCron(hour: number, minute: number): string {
    // EAT = UTC+3, so subtract 3 hours
    let utcHour = hour - 3;
    if (utcHour < 0) utcHour += 24;
    return `${minute} ${utcHour} * * *`;
}

// Store scheduled tasks for cleanup
const scheduledTasks: cron.ScheduledTask[] = [];

// Schedule all cron jobs based on settings
async function scheduleCronJobs() {
    const { getSystemSettings } = await import('./firebase');
    const settings = await getSystemSettings();
    const { cronTimes } = settings;

    // Clear any existing tasks
    scheduledTasks.forEach(task => task.stop());
    scheduledTasks.length = 0;

    // Scrape cron
    const scrapeCron = eatToUtcCron(cronTimes.scrape.hour, cronTimes.scrape.minute);
    scheduledTasks.push(cron.schedule(scrapeCron, async () => {
        const eatTime = `${cronTimes.scrape.hour}:${String(cronTimes.scrape.minute).padStart(2, '0')}`;
        addLog('info', `⏰ Scrape cron triggered (${eatTime} EAT)`);

        const currentSettings = await getSystemSettings();
        if (!currentSettings.scrapeEnabled) {
            addLog('warning', '⏸️ Scrape skipped - disabled in settings');
            return;
        }

        try {
            await runScrape(addLog);
        } catch (error: any) {
            addLog('error', `Scrape cron failed: ${error.message}`);
        }
    }, { timezone: 'UTC' }));

    // Morning dispatch cron
    const morningCron = eatToUtcCron(cronTimes.morning.hour, cronTimes.morning.minute);
    scheduledTasks.push(cron.schedule(morningCron, async () => {
        const eatTime = `${cronTimes.morning.hour}:${String(cronTimes.morning.minute).padStart(2, '0')}`;
        addLog('info', `⏰ Morning dispatch cron triggered (${eatTime} EAT)`);

        const currentSettings = await getSystemSettings();
        if (!currentSettings.dispatchEnabled) {
            addLog('warning', '⏸️ Morning dispatch skipped - disabled in settings');
            return;
        }

        if (dispatchInProgress) {
            addLog('warning', 'Morning dispatch skipped - another dispatch in progress');
            return;
        }

        dispatchInProgress = true;
        currentDispatchWindow = 'morning';
        try {
            await runDispatch('morning', addLog);
        } catch (error: any) {
            addLog('error', `Morning dispatch failed: ${error.message}`);
        } finally {
            dispatchInProgress = false;
            currentDispatchWindow = null;
        }
    }, { timezone: 'UTC' }));

    // Lunch dispatch cron
    const lunchCron = eatToUtcCron(cronTimes.lunch.hour, cronTimes.lunch.minute);
    scheduledTasks.push(cron.schedule(lunchCron, async () => {
        const eatTime = `${cronTimes.lunch.hour}:${String(cronTimes.lunch.minute).padStart(2, '0')}`;
        addLog('info', `⏰ Lunch dispatch cron triggered (${eatTime} EAT)`);

        const currentSettings = await getSystemSettings();
        if (!currentSettings.dispatchEnabled) {
            addLog('warning', '⏸️ Lunch dispatch skipped - disabled in settings');
            return;
        }

        if (dispatchInProgress) {
            addLog('warning', 'Lunch dispatch skipped - another dispatch in progress');
            return;
        }

        dispatchInProgress = true;
        currentDispatchWindow = 'lunch';
        try {
            await runDispatch('lunch', addLog);
        } catch (error: any) {
            addLog('error', `Lunch dispatch failed: ${error.message}`);
        } finally {
            dispatchInProgress = false;
            currentDispatchWindow = null;
        }
    }, { timezone: 'UTC' }));

    // Evening dispatch cron
    const eveningCron = eatToUtcCron(cronTimes.evening.hour, cronTimes.evening.minute);
    scheduledTasks.push(cron.schedule(eveningCron, async () => {
        const eatTime = `${cronTimes.evening.hour}:${String(cronTimes.evening.minute).padStart(2, '0')}`;
        addLog('info', `⏰ Evening dispatch cron triggered (${eatTime} EAT)`);

        const currentSettings = await getSystemSettings();
        if (!currentSettings.dispatchEnabled) {
            addLog('warning', '⏸️ Evening dispatch skipped - disabled in settings');
            return;
        }

        if (dispatchInProgress) {
            addLog('warning', 'Evening dispatch skipped - another dispatch in progress');
            return;
        }

        dispatchInProgress = true;
        currentDispatchWindow = 'evening';
        try {
            await runDispatch('evening', addLog);
        } catch (error: any) {
            addLog('error', `Evening dispatch failed: ${error.message}`);
        } finally {
            dispatchInProgress = false;
            currentDispatchWindow = null;
        }
    }, { timezone: 'UTC' }));

    // Log scheduled times
    const formatTime = (t: { hour: number; minute: number }) =>
        `${t.hour}:${String(t.minute).padStart(2, '0')} EAT`;

    addLog('info', 'Cron jobs scheduled:');
    addLog('info', `  - Scrape: ${formatTime(cronTimes.scrape)}`);
    addLog('info', `  - Morning: ${formatTime(cronTimes.morning)}`);
    addLog('info', `  - Lunch: ${formatTime(cronTimes.lunch)}`);
    addLog('info', `  - Evening: ${formatTime(cronTimes.evening)}`);
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
        startedAt: new Date().toISOString()
    });

    // Schedule cron jobs from settings
    await scheduleCronJobs();

    app.listen(PORT, () => {
        addLog('info', `🚀 Worker server running on port ${PORT}`);
    });
}

start().catch((error) => {
    console.error('Failed to start worker:', error);
    process.exit(1);
});

