"use strict";
/**
 * LeadGen Worker
 *
 * Standalone process for:
 * - Scraping leads (5 AM daily)
 * - Dispatching messages (6:30 AM, 12:30 PM, 7:30 PM)
 * - Running WhatsApp bot
 * - Providing status API
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const node_cron_1 = __importDefault(require("node-cron"));
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
// Load environment variables from parent directory
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, '../../.env') });
const firebase_1 = require("./firebase");
const scrape_runner_1 = require("./scrape-runner");
const dispatch_runner_1 = require("./dispatch-runner");
const app = (0, express_1.default)();
const PORT = process.env.WORKER_PORT || 4000;
// Middleware
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// In-memory logs (last 100)
const logs = [];
const addLog = (level, message) => {
    const entry = { timestamp: new Date().toISOString(), level, message };
    logs.unshift(entry);
    if (logs.length > 100)
        logs.pop();
    console.log(`[${level.toUpperCase()}] ${message}`);
};
// ============================================
// STATUS API
// ============================================
app.get('/status', async (req, res) => {
    try {
        const workerData = await (0, firebase_1.getWorkerStatus)();
        res.json({
            alive: true,
            uptime: process.uptime(),
            ...workerData,
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.get('/logs', (req, res) => {
    const limit = parseInt(req.query.limit) || 50;
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
        const result = await (0, scrape_runner_1.runScrape)(addLog);
        res.json({ success: true, result });
    }
    catch (error) {
        addLog('error', `Scrape failed: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});
app.post('/trigger/dispatch/:window', async (req, res) => {
    const window = req.params.window;
    if (!['morning', 'lunch', 'evening'].includes(window)) {
        return res.status(400).json({ error: 'Invalid window' });
    }
    addLog('info', `Manual dispatch triggered for ${window}`);
    try {
        const result = await (0, dispatch_runner_1.runDispatch)(window, addLog);
        res.json({ success: true, result });
    }
    catch (error) {
        addLog('error', `Dispatch failed: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});
// ============================================
// CRON JOBS (EAT = UTC+3)
// ============================================
// 5:00 AM EAT = 2:00 AM UTC
node_cron_1.default.schedule('0 2 * * *', async () => {
    addLog('info', '⏰ Scrape cron triggered (5:00 AM EAT)');
    try {
        await (0, scrape_runner_1.runScrape)(addLog);
    }
    catch (error) {
        addLog('error', `Scrape cron failed: ${error.message}`);
    }
}, { timezone: 'UTC' });
// 6:30 AM EAT = 3:30 AM UTC
node_cron_1.default.schedule('30 3 * * *', async () => {
    addLog('info', '⏰ Morning dispatch cron triggered (6:30 AM EAT)');
    try {
        await (0, dispatch_runner_1.runDispatch)('morning', addLog);
    }
    catch (error) {
        addLog('error', `Morning dispatch failed: ${error.message}`);
    }
}, { timezone: 'UTC' });
// 12:30 PM EAT = 9:30 AM UTC
node_cron_1.default.schedule('30 9 * * *', async () => {
    addLog('info', '⏰ Lunch dispatch cron triggered (12:30 PM EAT)');
    try {
        await (0, dispatch_runner_1.runDispatch)('lunch', addLog);
    }
    catch (error) {
        addLog('error', `Lunch dispatch failed: ${error.message}`);
    }
}, { timezone: 'UTC' });
// 7:30 PM EAT = 4:30 PM UTC
node_cron_1.default.schedule('30 16 * * *', async () => {
    addLog('info', '⏰ Evening dispatch cron triggered (7:30 PM EAT)');
    try {
        await (0, dispatch_runner_1.runDispatch)('evening', addLog);
    }
    catch (error) {
        addLog('error', `Evening dispatch failed: ${error.message}`);
    }
}, { timezone: 'UTC' });
// ============================================
// STARTUP
// ============================================
async function start() {
    addLog('info', 'Initializing Firebase...');
    await (0, firebase_1.initializeFirebase)();
    await (0, firebase_1.updateWorkerStatus)({
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
