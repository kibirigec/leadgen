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
import { getMessage } from './message-variants';

puppeteer.use(StealthPlugin());

type LogFn = (level: string, message: string) => void;

interface Lead {
    id: string;
    name: string;
    phone: string;
    website?: string;
    businessType?: string;
    city?: string;
}

// Phone number validation
function isValidPhone(phone: string): boolean {
    // Remove all non-digit characters
    const cleaned = phone.replace(/\D/g, '');
    // Valid if 10-15 digits (international format)
    return cleaned.length >= 10 && cleaned.length <= 15;
}

// Normalize phone number for WhatsApp
function normalizePhone(phone: string): string {
    let cleaned = phone.replace(/\D/g, '');
    // Add Uganda country code if missing
    if (cleaned.startsWith('0')) {
        cleaned = '256' + cleaned.substring(1);
    } else if (!cleaned.startsWith('256') && cleaned.length === 9) {
        cleaned = '256' + cleaned;
    }
    return cleaned;
}

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
        // Fallback for local debugging (when Firebase isn't init)
        if ((e as Error).message.includes('not initialized')) {
            // console.log('[LOCAL DEBUG] Status Update:', data);
        } else {
            console.error('Failed to update bot status:', e);
        }
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
        // Fallback for local debugging
        if ((e as Error).message.includes('not initialized')) {
            // console.log(`[LOCAL DEBUG] Log (${type}): ${message}`, leadName ? `[${leadName}]` : '');
        } else {
            console.error('Failed to add bot log:', e);
        }
    }
}

export async function runWhatsAppBot(
    leads: Lead[],
    log: LogFn
): Promise<{ success: boolean; sentCount: number; contactedLeadIds: string[] }> {
    const sessionDir = process.env.WWEB_SESSION_PATH || path.join(os.homedir(), '.wweb_session');

    log('info', `Starting bot with ${leads.length} leads`);
    log('info', `Session: ${sessionDir}`);

    // Update dashboard status
    await updateBotStatus({ status: 'starting', totalLeads: leads.length, processedLeads: 0, errorCount: 0 });
    await addBotLog('info', `Bot starting with ${leads.length} leads`);

    let browser: any;
    let page: any;
    let sentCount = 0;
    let errorCount = 0;
    const contactedLeadIds: string[] = [];

    // Helper to launch/restart browser
    const initBrowser = async () => {
        log('info', `[DEBUG] HEADLESS env var: '${process.env.HEADLESS}'`);
        if (browser) {
            try { await browser.close(); } catch (e) { /* ignore */ }
        }

        browser = await puppeteer.launch({
            headless: process.env.HEADLESS === 'false' ? false : true,
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
            protocolTimeout: 480000,
            userDataDir: sessionDir,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-gpu',
                '--disable-dev-shm-usage',
                '--disable-extensions',
                '--mute-audio',
                '--js-flags="--max-old-space-size=512"', // Limit memory to 512MB to prevent OOM
            ],
        });

        page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 2 });

        // Disable request interception to ensure all UI assets load (Stability > Speed)
        // await page.setRequestInterception(true);
        // page.on('request', (replaceRequest: any) => { ... });

        log('info', 'Navigating to WhatsApp Web...');
        await page.goto('https://web.whatsapp.com', {
            waitUntil: 'domcontentloaded',
            timeout: 300000,
        });

        const loginSelector = '[data-testid="chat-list"], #side';
        await page.waitForSelector(loginSelector, { timeout: 60000 });
        log('info', 'Logged in successfully');

        // WARMUP
        log('info', '⏳ Waiting 60s for WhatsApp sync with new browser session...');
        await new Promise(r => setTimeout(r, 60000));
    };

    try {
        // Initial Launch
        await initBrowser();
        await updateBotStatus({ status: 'running' });

        // Process leads
        for (let i = 0; i < leads.length; i++) {
            const lead = leads[i];
            const currentStatus = await getBotStatus();

            if (currentStatus === 'stopped') {
                log('info', '🛑 Bot stopped by user');
                break;
            }

            try {
                // ... (Normal processing logic) ...
                log('info', `Processing: ${lead.name}`);
                await updateBotStatus({
                    status: 'running',
                    currentLead: lead.name,
                    processedLeads: i,
                    totalLeads: leads.length,
                    errorCount,
                });

                const message = getMessage(lead.name, lead.businessType || 'business');
                console.log(`[DEBUG] Phone check for: ${lead.phone}`);
                if (!isValidPhone(lead.phone)) {
                    log('warning', `  ⚠️ Invalid phone: ${lead.phone} - skipping`);
                    console.log(`[DEBUG] Skipped due to invalid phone`);
                    continue;
                }
                const phoneNumber = normalizePhone(lead.phone);
                const url = `https://web.whatsapp.com/send?phone=${phoneNumber}&text=${encodeURIComponent(message)}`;
                console.log(`[DEBUG] Navigating to: ${url.substring(0, 50)}...`);

                let navigated = false;
                for (let attempt = 1; attempt <= 3; attempt++) {
                    try {
                        console.log(`[DEBUG] Nav attempt ${attempt}...`);
                        await page.evaluate((targetUrl: string) => {
                            // @ts-ignore
                            const link = document.createElement('a');
                            link.href = targetUrl;
                            // @ts-ignore
                            document.body.appendChild(link);
                            link.click();
                            // @ts-ignore
                            document.body.removeChild(link);
                        }, url);

                        // Wait for React to react (Drastically increased for VPS load)
                        console.log(`[DEBUG] Nav success, waiting 25s for UI render...`);
                        await new Promise(r => setTimeout(r, 25000));
                        navigated = true;
                        break;
                    } catch (navError: any) {
                        console.log(`[DEBUG] Nav error: ${navError.message}`);
                        if (attempt < 3) {
                            // Check for critical protocol errors
                            if (navError.message.includes('Protocol') || navError.message.includes('Session closed')) {
                                throw navError; // Escalates to critical error handler
                            }
                            log('warning', `  ⏳ Navigation attempt ${attempt}/3 failed, retrying...`);
                            await new Promise(r => setTimeout(r, 5000));
                        } else {
                            throw navError;
                        }
                    }
                }

                if (!navigated) {
                    console.log(`[DEBUG] Skipped: !navigated`);
                    continue;
                }

                // Find input
                console.log(`[DEBUG] looking for input selectors...`);
                const inputSelectors = [
                    '[data-testid="conversation-compose-box-input"]',
                    'div[contenteditable="true"][data-tab="10"]',
                    'footer div[contenteditable="true"]',
                    '#main footer div[contenteditable="true"]',
                ];

                let found = false;
                let foundSelector = '';
                for (const selector of inputSelectors) {
                    try {
                        await page.waitForSelector(selector, { timeout: 45000 });
                        found = true;
                        foundSelector = selector;
                        break;
                    } catch { }
                }

                if (!found) {
                    // Check content for errors or splash
                    const pageContent = await page.content();
                    if (pageContent.includes('splashscreen')) {
                        throw new Error('CRITICAL: Stuck on splash screen');
                    }
                    if (pageContent.includes('phone number isn\'t on WhatsApp')) {
                        log('warning', `  ⚠️ Not on WhatsApp: ${lead.name}`);
                        continue;
                    }
                    log('warning', `  Could not find input box`);
                    errorCount++;
                    continue;
                }

                // Send
                console.log(`[DEBUG] Found input, ensuring focus...`);
                // Take debug screenshot BEFORE sending to verify text presence
                await page.screenshot({ path: `/tmp/pre_send_${lead.id}_${i}.png` });

                // Method 1: Focus and Press Enter
                await page.click(foundSelector); // Explicit click to focus
                await new Promise(r => setTimeout(r, 500));
                await page.keyboard.press('Enter');

                // Method 2: Click Send Button (Backup)
                try {
                    const sendButtonSelector = 'span[data-icon="send"], button[aria-label="Send"]';
                    await page.waitForSelector(sendButtonSelector, { timeout: 2000 });
                    await page.click(sendButtonSelector);
                    console.log(`[DEBUG] Clicked Send button fallback`);
                } catch (e) {
                    console.log(`[DEBUG] Send button not found or Enter already worked`);
                }

                await new Promise(r => setTimeout(r, 2000));

                sentCount++;
                contactedLeadIds.push(lead.id);
                log('info', `✅ Sent to ${lead.name}`);
                await addBotLog('info', `Sent to ${lead.name}`);

                const delay = 30000 + Math.floor(Math.random() * 30000);
                log('info', `⏳ Waiting ${Math.round(delay / 1000)}s...`);
                await new Promise(r => setTimeout(r, delay));

            } catch (error: any) {
                log('error', `Failed for ${lead.name}: ${error.message}`);
                errorCount++;

                // CRITICAL ERROR RECOVERY
                if (error.message.includes('Protocol') ||
                    error.message.includes('Session closed') ||
                    error.message.includes('Target closed') ||
                    error.message.includes('CRITICAL')) {

                    log('warning', '♻️ CRITICAL ERROR DETECTED: Restarting browser to recover...');
                    await addBotLog('warning', 'Browser crashed/hung, performing auto-restart...');

                    try {
                        await initBrowser();
                        // Retry this lead? Yes.
                        i--;
                    } catch (restartError: any) {
                        log('error', `❌ FATAL: Could not restart browser: ${restartError.message}`);
                        break; // Give up if we can't even restart
                    }
                }
            }
        }

    } finally {
        if (browser) await browser.close();
    }

    await updateBotStatus({ status: 'idle', processedLeads: leads.length, totalLeads: leads.length, errorCount });
    return { success: true, sentCount, contactedLeadIds };
}
