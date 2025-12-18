/**
 * WhatsApp Bot for Worker
 * 
 * Simplified bot that runs in the worker process
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import os from 'os';
import path from 'path';
import fs from 'fs';

puppeteer.use(StealthPlugin());

type LogFn = (level: string, message: string) => void;

interface Lead {
    id: string;
    name: string;
    phone: string;
    website?: string;
    businessType?: string;
}

export async function runWhatsAppBot(
    leads: Lead[],
    log: LogFn
): Promise<{ success: boolean; sentCount: number; contactedLeadIds: string[] }> {
    const sessionDir = process.env.WWEB_SESSION_PATH || path.join(os.homedir(), '.wweb_session');

    log('info', `Starting bot with ${leads.length} leads`);
    log('info', `Session: ${sessionDir}`);

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
    const contactedLeadIds: string[] = [];

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

                // Use WhatsApp Web direct link format
                const url = `https://web.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(message)}`;

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
                    // Check if there's an "invalid number" message
                    const invalidCheck = await page.$('div[data-testid="popup-contents"]');
                    if (invalidCheck) {
                        log('warning', `  Phone ${phone} may be invalid - skipping`);
                        continue;
                    }
                    log('warning', `  Could not find input box - skipping ${lead.name}`);
                    continue;
                }

                // Small delay then press Enter to send
                await new Promise(r => setTimeout(r, 1000));
                await page.keyboard.press('Enter');

                // Wait to confirm send
                await new Promise(r => setTimeout(r, 2000));

                sentCount++;
                contactedLeadIds.push(lead.id);
                log('info', `✅ Sent to ${lead.name} (${phone})`);

                // Human-like delay (30-60 seconds)
                const delay = 30000 + Math.floor(Math.random() * 30000);
                log('info', `⏳ Waiting ${Math.round(delay / 1000)}s...`);
                await new Promise(r => setTimeout(r, delay));

            } catch (error: any) {
                log('error', `Failed for ${lead.name}: ${error.message}`);
            }
        }
    } finally {
        await browser.close();
    }

    return { success: true, sentCount, contactedLeadIds };
}

function normalizePhone(phone: string): string {
    let cleaned = phone.replace(/\D/g, '');
    if (cleaned.startsWith('0')) {
        cleaned = '256' + cleaned.slice(1);
    }
    if (!cleaned.startsWith('256') && cleaned.length === 9) {
        cleaned = '256' + cleaned;
    }
    return cleaned;
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
