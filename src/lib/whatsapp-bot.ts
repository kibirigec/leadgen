import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Business } from './types';
import { createWhatsAppLink } from './utils';

puppeteer.use(StealthPlugin());

export async function runWhatsAppBot(
    leads: Business[],
    onStatusUpdate?: (data: { status: string, qrCode?: string | null, screenshot?: string | null }) => Promise<void>
) {
    console.log("Starting WhatsApp Automation Bot...");

    const isDocker = process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD === 'true';

    // Determine executable path:
    // 1. Use env var if set (e.g. in Docker)
    // 2. If on Mac, try standard Chrome path
    // 3. Otherwise (Linux/Windows), let Puppeteer use its bundled Chromium (undefined)
    let executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    if (!executablePath && process.platform === 'darwin') {
        executablePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
    }

    const browser = await puppeteer.launch({
        headless: isDocker ? true : false, // Headless in Docker, visible locally
        userDataDir: "./.wweb_session",
        executablePath: executablePath, // Undefined means use bundled Chromium
        args: isDocker ? [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu'
        ] : [
            '--no-sandbox', // Often needed on Linux even with GUI
            '--disable-setuid-sandbox'
        ]
    });

    const page = await browser.newPage();

    // Set a real User Agent to avoid being blocked by WhatsApp Web
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

    // 1. Login Phase
    if (onStatusUpdate) await onStatusUpdate({ status: "starting" });
    console.log("Please scan the QR code if not logged in...");

    try {
        await page.goto("https://web.whatsapp.com", {
            waitUntil: 'networkidle2',
            timeout: 60000
        });
    } catch (navError) {
        console.warn("Navigation timeout or error, continuing to check selectors anyway...", navError);
    }

    try {
        // Wait for either the chat list (already logged in) or the QR code
        const chatListSelector = 'div[aria-label="Chat list"]';
        const qrCodeSelector = 'canvas[aria-label="Scan this QR code"]';
        const reloadSelector = 'button[data-testid="reload-qr"]'; // "Click to reload QR code"

        const firstElement = await Promise.race([
            page.waitForSelector(chatListSelector, { timeout: 120000 }).then(() => 'chat-list'),
            page.waitForSelector(qrCodeSelector, { timeout: 120000 }).then(() => 'qr-code'),
            page.waitForSelector(reloadSelector, { timeout: 120000 }).then(() => 'reload-qr')
        ]);

        if (firstElement === 'reload-qr') {
            console.log("Reload QR code button detected. Clicking it...");
            await page.click(reloadSelector);
            // Wait for QR code again
            await page.waitForSelector(qrCodeSelector, { timeout: 30000 });
            // Fall through to QR code handling
        }

        if (firstElement === 'qr-code' || firstElement === 'reload-qr') {
            console.log("QR Code detected! Waiting for scan...");

            // Extract QR Code Data URL
            const qrDataUrl = await page.evaluate(() => {
                const canvas = document.querySelector('canvas[aria-label="Scan this QR code"]') as HTMLCanvasElement;
                return canvas ? canvas.toDataURL() : null;
            });

            if (qrDataUrl && onStatusUpdate) {
                console.log("Exporting QR Code...");
                await onStatusUpdate({ status: "waiting_for_scan", qrCode: qrDataUrl });
            }

            // Wait for login to complete after QR scan
            // We use a very long timeout here because the user needs time to scan
            await page.waitForSelector(chatListSelector, { timeout: 0 });
        }

        console.log("Logged in successfully!");
        if (onStatusUpdate) await onStatusUpdate({ status: "logged_in", qrCode: null });
    } catch (e) {
        console.error("Login Phase Error Details:", e);

        // Capture screenshot for debugging
        const screenshot = await page.screenshot({ encoding: 'base64' });
        if (onStatusUpdate) {
            await onStatusUpdate({
                status: "error",
                screenshot: `data:image/png;base64,${screenshot}`
            });
        }

        console.log("Login timed out or failed. Please try again.");
        await browser.close();
        throw new Error("Login failed: " + (e instanceof Error ? e.message : String(e)));
    }

    // 2. Sending Loop
    const contactedLeadIds: string[] = [];
    let sentCount = 0;
    for (const lead of leads) {
        if (!lead.phone) continue;

        console.log(`\n--- Processing: ${lead.name} (${lead.phone}) [ID: ${lead.id}] ---`);

        // ... (url generation) ...
        const TEST_PHONE = "256775910888";
        const url = createWhatsAppLink(TEST_PHONE, lead.name, lead.location || "your area");

        console.log(`Navigating to: ${url}`);
        await page.goto(url);

        try {
            // Wait for the message box to load
            const inputBoxSelector = 'div[contenteditable="true"][aria-label="Type a message"]';
            await page.waitForSelector(inputBoxSelector, { timeout: 30000 });

            // Small delay to ensure UI is stable
            await new Promise(r => setTimeout(r, 2000));

            // Check if message was populated
            const messagePopulated = await page.evaluate((selector) => {
                const el = document.querySelector(selector) as HTMLElement;
                return el && el.innerText.length > 0;
            }, inputBoxSelector);

            if (!messagePopulated) {
                console.log("Message not auto-populated. Typing manually...");
                // Focus and type
                await page.click(inputBoxSelector);
                // Extract message from URL since we don't have it in scope easily, 
                // OR better: we have it in the loop. Let's reconstruct it.
                // Actually, we can just use the clipboard or type it.
                // Let's use the `lead` object which is in scope.
                const message = `Hi 👋\n\nI came across ${lead.name} on Google — very nice place!\n\nI noticed you don’t have a website, which might be costing you customers who try to find you online.\n\nI help local businesses get a simple site + automated chat that replies to customers after hours and brings in more inquiries.\n\nWould you be open to seeing a free demo made specifically for ${lead.name}?\n\nYou can also check us out at weblery.com`;

                await page.keyboard.type(message, { delay: 10 }); // Type like a human
                await new Promise(r => setTimeout(r, 1000));
            }

            // Try to find the send button
            const sendButtonSelectors = [
                'button[aria-label="Send"]',
                'span[data-icon="send"]',
                'button .icon-send'
            ];

            let sent = false;
            for (const selector of sendButtonSelectors) {
                if (await page.$(selector)) {
                    console.log(`Found send button with selector: ${selector}`);
                    await page.click(selector);
                    sent = true;
                    break;
                }
            }

            // Fallback: Press Enter
            if (!sent) {
                console.log("Send button not found, trying Enter key...");
                await page.keyboard.press('Enter');
                sent = true;
            }

            if (sent) {
                console.log("Message sent action triggered!");
                sentCount++;
                contactedLeadIds.push(lead.id);

                // Wait for send to complete (check for single tick or just wait)
                await new Promise(r => setTimeout(r, 3000));
            }

        } catch (e) {
            console.error(`Failed to send to ${lead.name}:`, e);
            // Continue to next lead even if one fails
        }
    }

    console.log(`\n--- Bot Finished. Sent ${sentCount} messages. ---`);
    console.log("Closing browser in 5 seconds...");
    await new Promise(r => setTimeout(r, 5000));
    await browser.close();

    return { success: true, sentCount, contactedLeadIds };
}
