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

    // Update dashboard status
    await updateBotStatus({ status: 'starting', totalLeads: leads.length, processedLeads: 0, errorCount: 0 });
    await addBotLog('info', `Bot starting with ${leads.length} leads`);

    const browser = await puppeteer.launch({
        headless: true,
        protocolTimeout: 480000, // 8 minutes - increased again for extreme load
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

    // Enable request interception to block images/fonts for performance
    await page.setRequestInterception(true);
    page.on('request', replaceRequest => {
        if (['image', 'media', 'font'].includes(replaceRequest.resourceType())) {
            replaceRequest.abort();
        } else {
            replaceRequest.continue();
        }
    });

    let sentCount = 0;
    let errorCount = 0;
    const contactedLeadIds: string[] = [];

    try {
        log('info', 'Navigating to WhatsApp Web...');
        await addBotLog('info', 'Navigating to WhatsApp Web...');

        await page.goto('https://web.whatsapp.com', {
            waitUntil: 'domcontentloaded', // Changed from networkidle2 to handle heavy sync
            timeout: 300000, // 5 minutes initial load timeout
        });

        // Wait for login
        const loginSelector = '[data-testid="chat-list"], #side';
        await page.waitForSelector(loginSelector, { timeout: 60000 });
        log('info', 'Logged in successfully');
        await addBotLog('info', 'Logged in to WhatsApp Web');
        await updateBotStatus({ status: 'running' });

        // WARMUP: Wait for initial sync to settle (Critical for VPS)
        log('info', '⏳ Waiting 60s for WhatsApp sync to settle...');
        await new Promise(r => setTimeout(r, 60000));

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

                // Validate and normalize phone number
                if (!isValidPhone(lead.phone)) {
                    log('warning', `  ⚠️ Invalid phone: ${lead.phone} - skipping`);
                    await addBotLog('warning', `Invalid phone number: ${lead.phone}`, lead.name);
                    continue; // Skip to next lead
                }

                const phoneNumber = normalizePhone(lead.phone);
                const url = `https://web.whatsapp.com/send?phone=${phoneNumber}&text=${encodeURIComponent(message)}`;

                // Navigate using Link Injection (Lighter than goto)
                let navigated = false;
                for (let attempt = 1; attempt <= 3; attempt++) {
                    try {
                        // Use link injection to force client-side nav without page reload overhead
                        await page.evaluate((targetUrl) => {
                            // @ts-ignore
                            const link = document.createElement('a');
                            link.href = targetUrl;
                            // @ts-ignore
                            document.body.appendChild(link);
                            link.click();
                            // @ts-ignore
                            document.body.removeChild(link);
                        }, url);

                        navigated = true;

                        // Wait for React to react
                        await new Promise(r => setTimeout(r, 3000));
                        break;
                    } catch (navError: any) {
                        if (attempt < 3) {
                            log('warning', `  ⏳ Navigation attempt ${attempt}/3 failed (${navError.message}), retrying in 5s...`);
                            await new Promise(r => setTimeout(r, 5000));
                        } else {
                            log('error', `  ❌ Navigation failed after 3 attempts: ${navError.message}`);
                            throw navError;
                        }
                    }
                }

                if (!navigated) continue;

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
                        await page.waitForSelector(selector, { timeout: 45000 }); // Increased to 45s for slow UI
                        found = true;
                        log('info', `  Found input with: ${selector}`);
                        break;
                    } catch {
                        // Try next selector
                    }
                }

                if (!found) {
                    // Check if it's an invalid number error
                    const pageContent = await page.content();
                    const isInvalidNumber = pageContent.includes('Phone number shared via url is invalid');
                    const isNotOnWhatApp = pageContent.includes('phone number isn\'t on WhatsApp');

                    if (isInvalidNumber || isNotOnWhatApp) {
                        log('warning', `  ⚠️ ${lead.name}: Not on WhatsApp - skipping`);
                        await addBotLog('warning', `Not on WhatsApp`, lead.name);

                        // Capture screenshot to verify it's actually invalid
                        const screenshotPath = `/tmp/invalid_${lead.id}_${i}.png`;
                        await page.screenshot({ path: screenshotPath, fullPage: true });
                        continue; // Skip to next lead
                    }

                    const screenshotPath = `/tmp/debug_${lead.id}_${i}.png`;
                    await page.screenshot({ path: screenshotPath, fullPage: true });
                    log('warning', `  Could not find input box - screenshot saved`);
                    // DEBUG: Print html structure to see what's actually there
                    log('warning', `  DEBUG HTML: ${pageContent.substring(0, 500)}...`);
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
                log('info', `✅ Sent to ${lead.name} (${phoneNumber})`);
                await addBotLog('info', `Message sent successfully`, lead.name);

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
