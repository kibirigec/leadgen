/**
 * WhatsApp Bot for Worker
 * 
 * Linked to main app's Firestore for monitor dashboard sync
 */

import puppeteer from 'puppeteer-extra';
// import type { Browser, Page } from 'puppeteer';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import os from 'os';
import path from 'path';
import { getDb, getBotStatus, getTestSettings } from './firebase';
import { getMessage } from './message-variants';
import { isValidPhone, normalizePhone } from '../../shared/phone-utils';
import { QueuedLead } from '../../shared/types';

puppeteer.use(StealthPlugin());

type LogFn = (level: string, message: string) => void;

// Re-export for backwards compatibility
type Lead = QueuedLead;

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
        // Log all failures - don't silently swallow errors
        console.error('[BOT] Failed to update bot status:', e);
    }
}

// Add log entry to Firestore (for /monitor dashboard)
// Path matches frontend: system/bot_logs/entries
async function addBotLog(type: 'info' | 'error' | 'warning', message: string, leadName?: string) {
    try {
        const db = getDb();
        await db.collection('system').doc('bot_logs').collection('entries').add({
            type,
            message,
            leadName: leadName || null,
            timestamp: new Date().toISOString(),
        });
    } catch (e) {
        console.error('[BOT] Failed to add log:', e);
    }
}

export async function runWhatsAppBot(
    leads: Lead[],
    log: LogFn
): Promise<{ success: boolean; sentCount: number; contactedLeadIds: string[] }> {
    const sessionDir = process.env.WWEB_SESSION_PATH || path.join(os.homedir(), '.wweb_session');

    // Check test mode
    const testSettings = await getTestSettings();
    const isTestMode = testSettings.testMode && testSettings.testPhone;

    if (isTestMode) {
        log('info', `🧪 TEST MODE ACTIVE - All messages will go to: ${testSettings.testPhone}`);
        await addBotLog('warning', `TEST MODE: Messages redirected to ${testSettings.testPhone}`);
    }

    log('info', `Starting bot with ${leads.length} leads`);
    log('info', `Session: ${sessionDir}`);

    // Update dashboard status
    await updateBotStatus({ status: 'starting', totalLeads: leads.length, processedLeads: 0, errorCount: 0 });
    await addBotLog('info', `Bot starting with ${leads.length} leads${isTestMode ? ' [TEST MODE]' : ''}`);

    let browser: any;
    let page: any;
    let sentCount = 0;
    let errorCount = 0;
    const contactedLeadIds: string[] = [];

    // Define selector here so it's available in loop
    const loginSelector = '[data-testid="chat-list"], #side';

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


        log('info', 'Navigating to WhatsApp Web...');
        await page.goto('https://web.whatsapp.com', {
            waitUntil: 'domcontentloaded',
            timeout: 300000,
        });

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
        let splashLoopCount = 0;
        let lastLeadIndex = -1;

        for (let i = 0; i < leads.length; i++) {
            // Reset splash counter for new leads
            if (i !== lastLeadIndex) {
                splashLoopCount = 0;
                lastLeadIndex = i;
            }

            const lead = leads[i];
            const currentStatus = await getBotStatus();

            if (currentStatus === 'stopped') {
                log('info', '🛑 Bot stopped by user');
                await addBotLog('warning', 'Bot stopped by user');
                break;
            }

            // Handle PAUSE - wait until resumed or stopped
            if (currentStatus === 'paused') {
                log('info', '⏸️ Bot paused. Waiting to resume...');
                await addBotLog('info', 'Bot paused by user');
                let isPaused = true;
                while (isPaused) {
                    await new Promise(r => setTimeout(r, 2000)); // Check every 2 seconds
                    const checkStatus = await getBotStatus();
                    if (checkStatus === 'stopped') {
                        log('info', '🛑 Bot stopped while paused');
                        await addBotLog('warning', 'Bot stopped while paused');
                        await browser?.close();
                        return { success: true, sentCount, contactedLeadIds };
                    }
                    if (checkStatus !== 'paused') {
                        log('info', '▶️ Bot resumed');
                        await addBotLog('info', 'Bot resumed');
                        isPaused = false;
                    }
                }
            }

            try {
                // ... (Normal processing logic) ...
                log('info', `Processing: ${lead.name}`);
                await updateBotStatus({
                    status: 'running',
                    currentLead: lead.name,
                    processedLeads: sentCount,
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

                // Override phone with test phone when in test mode
                const actualPhone = isTestMode ? testSettings.testPhone : lead.phone;
                const phoneNumber = normalizePhone(actualPhone);

                if (isTestMode) {
                    log('info', `  🧪 [TEST] Sending to ${phoneNumber} instead of ${lead.phone}`);
                }

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
                // Re-verify loginSelector availability

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
                        splashLoopCount++;
                        if (splashLoopCount > 2) {
                            log('error', `❌ Critical: Stuck in splash loop for ${lead.phone}. Restarting browser and skipping lead to save batch.`);

                            // FORCE RESTART: Clear RAM so the next lead has a fresh start
                            try { await browser?.close(); } catch { }
                            await initBrowser();

                            // Reset counters
                            splashLoopCount = 0;
                            lastLeadIndex = -1;

                            continue; // Move to next lead
                        }

                        log('warning', '⚠️ Splash screen detected. Waiting for auto-reload to finish...');
                        // Graceful recovery: Wait for app to become ready again
                        try {
                            await page.waitForSelector(loginSelector, { timeout: 60000 });
                            log('info', '✅ App recovered from splash screen. Retrying lead...');
                            // Retry this lead by decrementing index
                            i--;
                            continue;
                        } catch (e) {
                            throw new Error('CRITICAL: Stuck on splash screen (Recovery failed)');
                        }
                    }
                    if (pageContent.includes('phone number isn\'t on WhatsApp')) {
                        log('warning', `  ⚠️ Not on WhatsApp: ${lead.name}`);
                        continue;
                    }
                    log('warning', `  Could not find input box`);
                    errorCount++;
                    continue;
                }

                // Send with verification
                console.log(`[DEBUG] Found input, ensuring focus...`);
                await page.screenshot({ path: `/tmp/pre_send_${lead.id}_${i}.png` });

                // Click to ensure focus
                await page.click(foundSelector);
                await new Promise(r => setTimeout(r, 500));

                // Try sending with verification (up to 3 attempts)
                let messageSent = false;
                const sendButtonSelector = 'span[data-icon="send"], button[aria-label="Send"]';

                for (let sendAttempt = 1; sendAttempt <= 3 && !messageSent; sendAttempt++) {
                    console.log(`[DEBUG] Send attempt ${sendAttempt}/3...`);

                    // Method 1: Press Enter
                    await page.keyboard.press('Enter');
                    await new Promise(r => setTimeout(r, 1500));

                    // Method 2: Click Send Button if still visible
                    try {
                        const sendBtn = await page.$(sendButtonSelector);
                        if (sendBtn) {
                            await sendBtn.click();
                            console.log(`[DEBUG] Clicked Send button`);
                            await new Promise(r => setTimeout(r, 1500));
                        }
                    } catch { }

                    // VERIFICATION: Check if message was sent
                    // The input should be empty after successful send
                    const inputContent = await page.evaluate((sel: string) => {
                        const el = document.querySelector(sel);
                        return el ? el.textContent?.trim() || '' : 'NOT_FOUND';
                    }, foundSelector);

                    console.log(`[DEBUG] Input content after send: "${inputContent.substring(0, 30)}..."`);

                    // If input is empty or very short, message was likely sent
                    if (inputContent === '' || inputContent.length < 10) {
                        // Additional check: Look for outgoing message bubble with checkmark
                        const hasCheckmark = await page.evaluate(() => {
                            const msgOut = document.querySelector('[data-icon="msg-check"], [data-icon="msg-dblcheck"], [data-icon="msg-time"]');
                            return !!msgOut;
                        });

                        if (hasCheckmark || inputContent === '') {
                            messageSent = true;
                            console.log(`[DEBUG] ✓ Message verified as sent`);
                        }
                    }

                    // Check for error popups
                    const pageContent = await page.content();
                    if (pageContent.includes('Phone number shared via url is invalid') ||
                        pageContent.includes('phone number isn\'t on WhatsApp')) {
                        console.log(`[DEBUG] ✗ Error popup detected - number invalid/not on WhatsApp`);
                        log('warning', `  ⚠️ ${lead.name}: Number not on WhatsApp`);
                        await addBotLog('warning', `${lead.name}: Number not on WhatsApp`);
                        break; // Don't retry, skip this lead
                    }

                    if (!messageSent && sendAttempt < 3) {
                        console.log(`[DEBUG] Retrying send...`);
                        // Re-click input to ensure focus
                        await page.click(foundSelector);
                        await new Promise(r => setTimeout(r, 500));
                    }
                }

                if (messageSent) {
                    sentCount++;
                    contactedLeadIds.push(lead.id);
                    log('info', `✅ Sent to ${lead.name}`);
                    await addBotLog('info', `Sent to ${lead.name}`);
                } else {
                    log('warning', `  ⚠️ Could not verify send for ${lead.name}`);
                    await addBotLog('warning', `Failed to verify send for ${lead.name}`);
                    errorCount++;
                }

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
