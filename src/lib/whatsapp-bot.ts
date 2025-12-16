import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Business } from './types';
import { createWhatsAppLink } from './utils';
import * as fs from 'fs';
import * as path from 'path';

puppeteer.use(StealthPlugin());

export async function runWhatsAppBot(
    leads: Business[],
    onStatusUpdate?: (data: { status: string, qrCode?: string | null, screenshot?: string | null }) => Promise<void>
) {
    console.log("Starting WhatsApp Automation Bot (Strict Mode)...");

    // 1. Launch Configuration
    // Use HEADFUL mode locally so user can scan QR directly from Chrome window
    // Use HEADLESS mode in production (Docker) where QR is sent to frontend
    const isLocalDev = !fs.existsSync("/app");

    // Different args for local vs Docker - some args crash Chrome on macOS
    const dockerArgs = [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-gpu",
        "--disable-software-rasterizer",
        "--disable-accelerated-2d-canvas",
        "--disable-accelerated-video-decode",
        "--disable-accelerated-video-encode",
        "--disable-dev-shm-usage",
        "--no-zygote",
        "--single-process",
        "--disable-background-networking",
        "--disable-sync",
        "--disable-notifications",
        "--disable-push-api",
        "--disable-component-update",
    ];

    const localArgs = [
        "--disable-notifications",
        "--disable-popup-blocking",
    ];

    const launchConfig: any = {
        headless: isLocalDev ? false : "new",
        userDataDir: isLocalDev
            ? path.resolve(process.cwd(), ".wweb_session")
            : "/app/.wweb_session",
        args: isLocalDev ? localArgs : dockerArgs,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH
    };

    // On Mac, set Chrome path if not in env
    if (isLocalDev) {
        console.log("🖥️  LOCAL MODE: Chrome window will open - scan QR code there!");
        if (!launchConfig.executablePath && process.platform === 'darwin') {
            launchConfig.executablePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
        }
    } else {
        console.log("🐳 DOCKER MODE: Running headless, QR sent to frontend.");
    }

    let browser;
    try {
        browser = await puppeteer.launch(launchConfig);
    } catch (e) {
        console.error("Failed to launch browser:", e);
        throw e;
    }

    const page = await browser.newPage();

    // 2. Navigation (MANDATORY)
    try {
        if (onStatusUpdate) await onStatusUpdate({ status: "starting" });
        console.log("Navigating to WhatsApp Web...");
        await page.goto("https://web.whatsapp.com", {
            waitUntil: "networkidle2",
            timeout: 120000,
        });
    } catch (e) {
        console.error("Navigation failed:", e);
        await browser.close();
        throw new Error("Page load timeout (120s)");
    }

    // 3. Login Detection & QR Handling (CRITICAL - FIXED RACE CONDITION)
    try {
        console.log("Waiting for login indicators or QR code...");

        // We also check for session directory existence as a hint
        const sessionExists = fs.existsSync(path.join(launchConfig.userDataDir, 'Default'));
        if (sessionExists) {
            console.log("Session directory found. Expecting restoration...");
        }

        // Flag to control the QR polling loop
        let isLoggedIn = false;
        let lastQrDataUrl: string | null = null;

        // Continuous QR polling function - runs until login is detected
        const pollForQR = async (): Promise<void> => {
            console.log("Starting QR code polling loop...");
            while (!isLoggedIn) {
                try {
                    // Check if canvas exists (quick check, don't wait long)
                    const canvas = await page.$('canvas');
                    if (canvas) {
                        const qrDataUrl = await page.evaluate(() => {
                            const c = document.querySelector('canvas');
                            return c ? c.toDataURL() : null;
                        });

                        // Only update if QR changed (avoid spamming Firestore)
                        if (qrDataUrl && qrDataUrl !== lastQrDataUrl) {
                            console.log("QR Code detected! Updating Firestore...");
                            lastQrDataUrl = qrDataUrl;
                            if (onStatusUpdate) {
                                await onStatusUpdate({ status: "waiting_for_scan", qrCode: qrDataUrl });
                            }
                        }
                    }
                } catch (e) {
                    // Ignore errors in QR check - page might be navigating
                }

                // Wait 2 seconds before next check (if not logged in yet)
                if (!isLoggedIn) {
                    await new Promise(r => setTimeout(r, 2000));
                }
            }
            console.log("QR polling loop ended (login detected).");
        };

        // Login detection promise - using multiple selector strategies
        const waitForLogin = async (): Promise<string> => {
            console.log("Waiting for any login indicator...");

            // Multiple possible selectors for logged-in state
            const loginSelectors = [
                '[data-testid="chat-list"]',
                '[data-testid="conversation-panel-wrapper"]',
                'div[aria-label="Type a message"]',
                '[contenteditable="true"][data-tab="10"]',
                'div[data-testid="cell-frame-container"]',
                '#side', // Main sidebar panel
                'div[data-testid="chatlist-header"]',
            ];

            // Try each selector
            const selectorPromises = loginSelectors.map((selector, index) =>
                page.waitForSelector(selector, { timeout: 120000 })
                    .then(() => {
                        console.log(`✅ Login detected via selector ${index + 1}: ${selector}`);
                        return 'success';
                    })
                    .catch(() => null)
            );

            const result = await Promise.race(selectorPromises);
            if (result === 'success') {
                return 'success';
            }

            // If all fail, throw
            throw new Error("No login indicators found");
        };

        // Run QR polling and login detection in parallel
        // pollForQR runs continuously, waitForLogin resolves when logged in
        const qrPollingPromise = pollForQR();
        const loginResult = await waitForLogin();

        // Signal the polling loop to stop
        isLoggedIn = true;

        console.log("Login indicators detected. Login successful.");
        if (onStatusUpdate) await onStatusUpdate({ status: "logged_in", qrCode: null });

    } catch (e) {
        console.error("Login failed or timed out.");

        // 4. Debug Mode (FAILURE ONLY)
        console.log("Entering Debug Mode...");
        await page.screenshot({ path: "login-failure.png", fullPage: true });

        if (onStatusUpdate) {
            const screenshot = await page.screenshot({ encoding: 'base64' });
            await onStatusUpdate({
                status: "error",
                screenshot: `data:image/png;base64,${screenshot}`
            });
        }

        await browser.close();
        throw new Error("Login failed after 120s/180s checks.");
    }

    // 5. Message Sending (ARIA-LABEL ONLY)
    const contactedLeadIds: string[] = [];
    let sentCount = 0;

    for (const lead of leads) {
        if (!lead.phone) continue;
        console.log(`\n--- Processing: ${lead.name} ---`);

        const TEST_PHONE = "256775910888";
        const url = createWhatsAppLink(TEST_PHONE, lead.name, lead.location || "your area");

        await page.goto(url);

        try {
            console.log("Waiting for message input box...");

            // Multiple possible selectors for the message input
            const inputSelectors = [
                'div[aria-label="Type a message"]',
                '[contenteditable="true"][data-tab="10"]',
                'div[data-testid="conversation-compose-box-input"]',
                'footer div[contenteditable="true"]',
            ];

            let inputBox = null;
            let usedSelector = '';
            for (const selector of inputSelectors) {
                try {
                    inputBox = await page.waitForSelector(selector, { timeout: 10000 });
                    if (inputBox) {
                        usedSelector = selector;
                        console.log(`✅ Input box found: ${selector}`);
                        break;
                    }
                } catch (e) {
                    // Try next selector
                }
            }

            if (!inputBox) {
                throw new Error("Could not find message input box");
            }

            // Type the message
            const message = `Hi 👋\n\nI came across ${lead.name} on Google — very nice place!\n\nI noticed you don't have a website, which might be costing you customers who try to find you online.\n\nI help local businesses get a simple site + automated chat that replies to customers after hours and brings in more inquiries.\n\nWould you be open to seeing a free demo made specifically for ${lead.name}?\n\nYou can also check us out at weblery.com`;

            // Check if message is already populated from URL
            const isPopulated = await page.evaluate((sel) => {
                const el = document.querySelector(sel) as HTMLElement;
                return el && el.innerText.trim().length > 0;
            }, usedSelector);

            if (!isPopulated) {
                console.log("Typing message...");
                await inputBox.click();
                await page.keyboard.type(message, { delay: 20 });
            } else {
                console.log("Message already populated from URL");
            }

            // Wait a moment for UI to update
            await new Promise(r => setTimeout(r, 500));

            // Find and click send button
            console.log("Looking for send button...");
            const sendSelectors = [
                'button[aria-label="Send"]',
                'span[data-icon="send"]',
                'button[data-testid="send"]',
                '[data-testid="compose-btn-send"]',
            ];

            let sent = false;
            for (const selector of sendSelectors) {
                try {
                    const sendBtn = await page.$(selector);
                    if (sendBtn) {
                        console.log(`✅ Send button found: ${selector}`);
                        await sendBtn.click();
                        sent = true;
                        break;
                    }
                } catch (e) {
                    // Try next
                }
            }

            // Fallback: try pressing Enter
            if (!sent) {
                console.log("Send button not found, pressing Enter...");
                await page.keyboard.press('Enter');
                sent = true;
            }

            console.log("✅ Message sent!");
            sentCount++;
            contactedLeadIds.push(lead.id);

            // Wait before next message
            await new Promise(r => setTimeout(r, 3000));

        } catch (e) {
            console.error(`❌ Failed to send to ${lead.name}:`, e);
        }
    }

    console.log("Closing browser...");
    await browser.close();
    return { success: true, sentCount, contactedLeadIds };
}
