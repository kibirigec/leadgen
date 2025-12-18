"use strict";
/**
 * WhatsApp Bot for Worker
 *
 * Simplified bot that runs in the worker process
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runWhatsAppBot = runWhatsAppBot;
const puppeteer_extra_1 = __importDefault(require("puppeteer-extra"));
const puppeteer_extra_plugin_stealth_1 = __importDefault(require("puppeteer-extra-plugin-stealth"));
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
puppeteer_extra_1.default.use((0, puppeteer_extra_plugin_stealth_1.default)());
async function runWhatsAppBot(leads, log) {
    const sessionDir = process.env.WWEB_SESSION_PATH || path_1.default.join(os_1.default.homedir(), '.wweb_session');
    log('info', `Starting bot with ${leads.length} leads`);
    log('info', `Session: ${sessionDir}`);
    const browser = await puppeteer_extra_1.default.launch({
        headless: true,
        userDataDir: sessionDir,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-gpu',
            '--disable-dev-shm-usage',
            '--no-zygote',
            '--single-process',
        ],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 2 });
    let sentCount = 0;
    const contactedLeadIds = [];
    try {
        log('info', 'Navigating to WhatsApp Web...');
        await page.goto('https://web.whatsapp.com', {
            waitUntil: 'networkidle2',
            timeout: 120000,
        });
        // Wait for login
        const loginSelector = '[data-testid="chat-list"], #side';
        await page.waitForSelector(loginSelector, { timeout: 60000 });
        log('info', 'Logged in successfully');
        // Process each lead
        for (const lead of leads) {
            try {
                log('info', `Processing: ${lead.name}`);
                const phone = normalizePhone(lead.phone);
                const message = getMessage(lead.name, lead.businessType || 'business');
                const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
                await page.goto(url);
                await page.waitForSelector('[data-testid="conversation-compose-box-input"]', { timeout: 30000 });
                await page.keyboard.press('Enter');
                sentCount++;
                contactedLeadIds.push(lead.id);
                log('info', `✅ Sent to ${lead.name}`);
                // Human-like delay (30-60 seconds)
                const delay = 30000 + Math.floor(Math.random() * 30000);
                log('info', `⏳ Waiting ${Math.round(delay / 1000)}s...`);
                await new Promise(r => setTimeout(r, delay));
            }
            catch (error) {
                log('error', `Failed for ${lead.name}: ${error.message}`);
            }
        }
    }
    finally {
        await browser.close();
    }
    return { success: true, sentCount, contactedLeadIds };
}
function normalizePhone(phone) {
    let cleaned = phone.replace(/\D/g, '');
    if (cleaned.startsWith('0')) {
        cleaned = '256' + cleaned.slice(1);
    }
    if (!cleaned.startsWith('256') && cleaned.length === 9) {
        cleaned = '256' + cleaned;
    }
    return cleaned;
}
function getMessage(businessName, businessType) {
    const templates = {
        clinic: [
            `Hi ${businessName}! Is this the right number for appointment inquiries?`,
            `Hello ${businessName}, I'm looking for a clinic in your area. Are you accepting new patients?`,
        ],
        restaurant: [
            `Hi ${businessName}! Do you take reservations on WhatsApp?`,
            `Hello! Is this ${businessName}? Looking to book a table soon.`,
        ],
        default: [
            `Hi ${businessName}! Is this the right contact for business inquiries?`,
            `Hello! I'm trying to reach ${businessName}. Is this the correct number?`,
        ],
    };
    const typeTemplates = templates[businessType] || templates.default;
    return typeTemplates[Math.floor(Math.random() * typeTemplates.length)];
}
