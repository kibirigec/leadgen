import puppeteer from 'puppeteer';
import { Business } from './types';
import { createWhatsAppLink } from './utils';

export async function runWhatsAppBot(leads: Business[], onQrCode?: (qr: string) => Promise<void>) {
    console.log("Starting WhatsApp Automation Bot...");

    const isDocker = process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD === 'true';

    const browser = await puppeteer.launch({
        headless: isDocker ? true : false, // Headless in Docker, visible locally
        userDataDir: "./.wweb_session",
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        args: isDocker ? [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process', // <- this one doesn't works in Windows
            '--disable-gpu'
        ] : []
    });

    const page = await browser.newPage();

    // 1. Login Phase
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

            if (qrDataUrl && onQrCode) {
                console.log("Exporting QR Code...");
                await onQrCode(qrDataUrl);
            }

            // Wait for login to complete after QR scan
            // We use a very long timeout here because the user needs time to scan
            await page.waitForSelector(chatListSelector, { timeout: 0 });
        }

        console.log("Logged in successfully!");
    } catch (e) {
        console.error("Login Phase Error Details:", e);
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
            // Wait for the message box to load (indicating we are ready to send)
            // This is better than waiting for the send button directly, as it might not be clickable yet
            await page.waitForSelector('div[contenteditable="true"]', { timeout: 30000 });

            // Small delay to ensure UI is stable
            await new Promise(r => setTimeout(r, 1000));

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
