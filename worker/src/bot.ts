/**
 * WhatsApp Bot for Worker
 * 
 * Linked to main app's Firestore for monitor dashboard sync
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import os from 'os';
import path from 'path';
import { getDb, getBotStatus } from './firebase';

puppeteer.use(StealthPlugin());

type LogFn = (level: string, message: string) => void;

interface Lead {
    id: string;
    name: string;
    phone: string;
    website?: string;
    businessType?: string;
}

// TEST MODE: All messages go to this number
const TEST_PHONE = "256775910888";

// Update bot status in Firestore (for /monitor dashboard)
async function updateBotStatus(data: {
    status: string;
    currentLead?: string;
    totalLeads?: number;
    processedLeads?: number;
    errorCount?: number;
}) {
    try {
        const db = getDb();
        await db.collection('system').doc('bot_status').set({
            ...data,
            updatedAt: new Date().toISOString(),
        }, { merge: true });
    } catch (e) {
        console.error('Failed to update bot status:', e);
    }
}

// Add log entry to Firestore (for /monitor dashboard)
async function addBotLog(type: 'info' | 'error' | 'warning', message: string, leadName?: string) {
    try {
        const db = getDb();
        await db.collection('bot_logs').add({
            type,
            message,
            leadName: leadName || null,
            timestamp: new Date().toISOString(),
        });
    } catch (e) {
        console.error('Failed to add bot log:', e);
    }
}

export async function runWhatsAppBot(
    leads: Lead[],
    log: LogFn
): Promise<{ success: boolean; sentCount: number; contactedLeadIds: string[] }> {
    const sessionDir = process.env.WWEB_SESSION_PATH || path.join(os.homedir(), '.wweb_session');

    log('info', `Starting bot with ${leads.length} leads`);
    log('info', `Session: ${sessionDir}`);
    log('info', `TEST MODE: All messages going to ${TEST_PHONE}`);

    // Update dashboard status
    await updateBotStatus({ status: 'starting', totalLeads: leads.length, processedLeads: 0, errorCount: 0 });
    await addBotLog('info', `Bot starting with ${leads.length} leads (TEST MODE)`);

    const browser = await puppeteer.launch({
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
    let errorCount = 0;
    const contactedLeadIds: string[] = [];

    try {
        log('info', 'Navigating to WhatsApp Web...');
        await addBotLog('info', 'Navigating to WhatsApp Web...');

        await page.goto('https://web.whatsapp.com', {
            waitUntil: 'networkidle2',
            timeout: 120000,
        });

        // Wait for login
        const loginSelector = '[data-testid="chat-list"], #side';
        await page.waitForSelector(loginSelector, { timeout: 60000 });
        log('info', 'Logged in successfully');
        await addBotLog('info', 'Logged in to WhatsApp Web');
        await updateBotStatus({ status: 'running' });

        // Process each lead
        for (let i = 0; i < leads.length; i++) {
            const lead = leads[i];

            // Check for pause/stop before processing each lead
            const currentStatus = await getBotStatus();
            log('info', `Status check: ${currentStatus}`);

            if (currentStatus === 'stopped') {
                log('info', '🛑 Bot stopped by user');
                await addBotLog('info', 'Bot stopped by user');
                await updateBotStatus({ status: 'stopped', processedLeads: i, totalLeads: leads.length });
                break;
            }

            // Handle pause - wait until resumed or stopped
            while (currentStatus === 'paused') {
                log('info', '⏸️ Bot paused, waiting...');
                await new Promise(r => setTimeout(r, 5000));
                const newStatus = await getBotStatus();
                if (newStatus === 'stopped') {
                    log('info', '🛑 Bot stopped while paused');
                    await addBotLog('info', 'Bot stopped by user');
                    await updateBotStatus({ status: 'stopped' });
                    await browser.close();
                    return { success: true, sentCount, contactedLeadIds };
                }
                if (newStatus !== 'paused') break;
            }

            try {
                log('info', `Processing: ${lead.name}`);
                await updateBotStatus({
                    status: 'running',
                    currentLead: lead.name,
                    processedLeads: i,
                    totalLeads: leads.length,
                    errorCount,
                });

                const message = getMessage(lead.name, lead.businessType || 'business');

                // TEST MODE: Use test phone instead of actual lead phone
                const url = `https://web.whatsapp.com/send?phone=${TEST_PHONE}&text=${encodeURIComponent(message)}`;

                await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

                // Wait for the chat to load - try multiple selectors
                const inputSelectors = [
                    '[data-testid="conversation-compose-box-input"]',
                    'div[contenteditable="true"][data-tab="10"]',
                    'footer div[contenteditable="true"]',
                    '#main footer div[contenteditable="true"]',
                ];

                let found = false;
                for (const selector of inputSelectors) {
                    try {
                        await page.waitForSelector(selector, { timeout: 15000 });
                        found = true;
                        log('info', `  Found input with: ${selector}`);
                        break;
                    } catch {
                        // Try next selector
                    }
                }

                if (!found) {
                    const screenshotPath = `/tmp/debug_${TEST_PHONE}_${i}.png`;
                    await page.screenshot({ path: screenshotPath, fullPage: true });
                    log('warning', `  Could not find input box - screenshot saved to ${screenshotPath}`);
                    await addBotLog('warning', `Could not find input box`, lead.name);
                    errorCount++;
                    continue;
                }

                // Small delay then press Enter to send
                await new Promise(r => setTimeout(r, 1000));
                await page.keyboard.press('Enter');

                // Wait to confirm send
                await new Promise(r => setTimeout(r, 2000));

                sentCount++;
                contactedLeadIds.push(lead.id);
                log('info', `✅ Sent to ${lead.name} (test: ${TEST_PHONE})`);
                await addBotLog('info', `Message sent successfully (test mode)`, lead.name);

                // Human-like delay (30-60 seconds)
                const delay = 30000 + Math.floor(Math.random() * 30000);
                log('info', `⏳ Waiting ${Math.round(delay / 1000)}s...`);
                await new Promise(r => setTimeout(r, delay));

            } catch (error: any) {
                log('error', `Failed for ${lead.name}: ${error.message}`);
                await addBotLog('error', error.message, lead.name);
                errorCount++;
            }
        }
    } finally {
        await browser.close();
    }

    // Final status update
    await updateBotStatus({
        status: 'idle',
        processedLeads: leads.length,
        totalLeads: leads.length,
        errorCount,
    });
    await addBotLog('info', `Bot finished. Sent: ${sentCount}, Errors: ${errorCount}`);

    return { success: true, sentCount, contactedLeadIds };
}

function getMessage(businessName: string, businessType: string): string {
    const templates: Record<string, string[]> = {
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
