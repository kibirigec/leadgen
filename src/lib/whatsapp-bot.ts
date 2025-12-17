import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Business } from './types';
import { createWhatsAppLink } from './utils';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

puppeteer.use(StealthPlugin());

export async function runWhatsAppBot(
    leads: Business[],
    onStatusUpdate?: (data: {
        status: string,
        qrCode?: string | null,
        screenshot?: string | null,
        currentLead?: string,
        totalLeads?: number,
        processedLeads?: number,
        errorCount?: number
    }) => Promise<void>,
    onLeadContacted?: (leadId: string) => Promise<void>,
    onLogEvent?: (type: "info" | "error" | "warning", message: string, leadName?: string) => Promise<void>,
    onCheckPause?: () => Promise<boolean>  // Returns true if paused
) {
    console.log("Starting WhatsApp Automation Bot (Strict Mode)...");

    // 1. Launch Configuration
    // Detect if we're on a server/VM: check for /app (Docker), running as root, or Linux server
    const inDocker = fs.existsSync("/app");
    const isRoot = process.getuid && process.getuid() === 0;
    const isLinuxServer = os.platform() === 'linux' && !process.env.DISPLAY;
    const isServerEnvironment = inDocker || isRoot || isLinuxServer;

    const isLocalDev = !isServerEnvironment;

    console.log(`Environment: ${isLocalDev ? 'Local Dev' : 'Server'} (Docker: ${inDocker}, Root: ${isRoot}, Linux: ${isLinuxServer})`);

    // Session directory - use env var, or fall back to home directory path
    // This ensures consistent location regardless of cwd
    const sessionDir = inDocker
        ? "/app/.wweb_session"
        : process.env.WWEB_SESSION_PATH || path.join(os.homedir(), ".wweb_session");

    console.log(`Session directory: ${sessionDir}`);

    // Server args - essential for running headless on Linux/Docker/VMs
    const serverArgs = [
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

    // Get Chrome executable path
    let executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    if (isLocalDev && !executablePath && process.platform === 'darwin') {
        executablePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
    }

    // Check if session directory exists (hint that login might be cached)
    const sessionExists = fs.existsSync(path.join(sessionDir, 'Default'));

    // SMART MODE: Try headless first if session exists, otherwise start headful
    let startHeadless = isLocalDev ? sessionExists : true;

    console.log(sessionExists
        ? "📦 Session found! Trying headless mode first..."
        : "🆕 No session found. Starting in headful mode for login...");

    let browser: Awaited<ReturnType<typeof puppeteer.launch>>;
    let page: Awaited<ReturnType<typeof browser.newPage>>;
    let needsLogin = false;

    // First attempt - try to use saved session
    const launchConfig: any = {
        headless: startHeadless ? "new" : false,
        userDataDir: sessionDir,
        args: isLocalDev ? localArgs : serverArgs,
        executablePath
    };

    try {
        browser = await puppeteer.launch(launchConfig);
    } catch (e) {
        console.error("Failed to launch browser:", e);
        throw e;
    }

    page = await browser.newPage();

    // Set viewport for better QR code quality
    await page.setViewport({
        width: 1280,
        height: 900,
        deviceScaleFactor: 2  // High DPI for clearer QR
    });

    // 2. Navigation
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

    // 3. Quick check: Are we already logged in or do we need QR?
    console.log("Checking login status...");

    // Race: login indicator vs QR code - BOTH need to be proper waits
    const quickCheck = await Promise.race([
        page.waitForSelector('#side', { timeout: 15000 })
            .then(() => 'logged_in')
            .catch(() => null),
        page.waitForSelector('canvas', { timeout: 15000 })
            .then(() => 'needs_qr')
            .catch(() => null),
    ]);

    console.log(`Login check result: ${quickCheck || 'neither detected'}`);

    if (quickCheck === 'logged_in') {
        console.log("✅ Already logged in! Proceeding in headless mode...");
        needsLogin = false;
    } else if (quickCheck === 'needs_qr' || quickCheck === null) {
        console.log("🔐 Login required (QR code needed)");
        needsLogin = true;

        // If we started headless but need login, switch to headful
        if (startHeadless && isLocalDev) {
            console.log("🔄 Switching to headful mode for QR scanning...");
            await browser.close();

            browser = await puppeteer.launch({
                headless: false,
                userDataDir: sessionDir,
                args: localArgs,
                executablePath
            });
            page = await browser.newPage();

            console.log("Navigating to WhatsApp Web (headful)...");
            await page.goto("https://web.whatsapp.com", {
                waitUntil: "networkidle2",
                timeout: 120000,
            });
        }
    }

    // 4. Login Detection & QR Handling (only if needed)
    if (needsLogin) {
        try {
            console.log("Waiting for login...");

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

        // ============================================================
        // PHASE 2: Close headful browser, relaunch in HEADLESS mode
        // ============================================================
        if (isLocalDev) {
            console.log("\n🔄 PHASE 2: Switching to headless mode for message automation...");
            await browser.close();

            // Relaunch in headless mode with same session
            const headlessConfig: any = {
                headless: "new",
                userDataDir: path.resolve(process.cwd(), ".wweb_session"),
                args: localArgs,
                executablePath: launchConfig.executablePath
            };

            browser = await puppeteer.launch(headlessConfig);
            page = await browser.newPage();

            // Navigate back to WhatsApp Web
            console.log("Navigating to WhatsApp Web in headless mode...");
            await page.goto("https://web.whatsapp.com", {
                waitUntil: "networkidle2",
                timeout: 60000,
            });

            // Wait for session to restore
            console.log("Waiting for session to restore...");
            await page.waitForSelector('#side', { timeout: 30000 });
            console.log("✅ Session restored in headless mode!");
        }
    } // End of if(needsLogin) block

    // 5. Message Sending (ARIA-LABEL ONLY)
    const contactedLeadIds: string[] = [];
    let sentCount = 0;
    let errorCount = 0;
    const totalLeads = leads.filter(l => l.phone).length;

    for (let i = 0; i < leads.length; i++) {
        const lead = leads[i];
        if (!lead.phone) continue;

        // Check for pause/stop state before each lead
        const { db } = await import("@/lib/firebase");
        const statusDoc = await db.collection("system").doc("bot_status").get();
        const currentStatus = statusDoc.data()?.status;

        // Check for STOP first - exit immediately
        if (currentStatus === 'stopped') {
            console.log("🛑 Bot stopped by user. Exiting...");
            if (onLogEvent) await onLogEvent("warning", "Bot stopped by user");
            await browser.close();
            return { success: true, sentCount, contactedLeadIds, stopped: true };
        }

        // Check for PAUSE - wait until resumed
        if (currentStatus === 'paused') {
            console.log("⏸️  Bot paused. Waiting to resume...");
            let isPaused = true;
            while (isPaused) {
                await new Promise(r => setTimeout(r, 2000)); // Check every 2 seconds

                const checkDoc = await db.collection("system").doc("bot_status").get();
                const checkStatus = checkDoc.data()?.status;

                if (checkStatus === 'stopped') {
                    console.log("🛑 Bot stopped by user. Exiting...");
                    if (onLogEvent) await onLogEvent("warning", "Bot stopped by user");
                    await browser.close();
                    return { success: true, sentCount, contactedLeadIds, stopped: true };
                }

                if (checkStatus !== 'paused') {
                    console.log("▶️  Bot resumed.");
                    isPaused = false;
                }
            }
        }

        console.log(`\n--- Processing: ${lead.name} (${sentCount + 1}/${totalLeads}) ---`);

        // Update status with current lead info
        if (onStatusUpdate) {
            await onStatusUpdate({
                status: "running",
                currentLead: lead.name,
                totalLeads,
                processedLeads: sentCount,
                errorCount
            });
        }

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

            // IMMEDIATELY update Firestore - don't wait until end of run
            if (onLeadContacted) {
                await onLeadContacted(lead.id);
                console.log(`   📝 Lead status updated in Firestore`);
            }

            // Log successful send
            if (onLogEvent) {
                await onLogEvent("info", `Message sent successfully`, lead.name);
            }

            // Wait before next message
            await new Promise(r => setTimeout(r, 3000));

        } catch (e: any) {
            console.error(`❌ Failed to send to ${lead.name}:`, e);
            errorCount++;

            // Log the error
            if (onLogEvent) {
                await onLogEvent("error", e.message || "Unknown error", lead.name);
            }
        }
    }

    console.log("Closing browser...");
    await browser.close();
    return { success: true, sentCount, contactedLeadIds, errorCount };
}
