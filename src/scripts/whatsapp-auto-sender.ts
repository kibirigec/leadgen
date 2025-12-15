import puppeteer from 'puppeteer';

const TEST_PHONE = "256775910888"; // User provided number
const MESSAGE = `Hi ✋

I came across your business on Google — very nice place!

I help local businesses get a simple site + automated chat that replies to customers after hours and brings in more inquiries.

Would you be open to seeing a free demo made specifically for you?

You can also check us out at weblery.com`;

async function run() {
    console.log("Starting WhatsApp Automation...");

    const browser = await puppeteer.launch({
        headless: false, // Must be false to scan QR
        userDataDir: "./.wweb_session", // Save session so we don't scan every time
        executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    });

    const page = await browser.newPage();

    // 1. Login Phase
    console.log("Please scan the QR code if not logged in...");
    await page.goto("https://web.whatsapp.com");

    // Wait for the chat list to appear (indicating login success)
    try {
        await page.waitForSelector('div[aria-label="Chat list"]', { timeout: 60000 });
        console.log("Logged in successfully!");
    } catch (e) {
        console.log("Login timed out or failed. Please try again.");
        await browser.close();
        return;
    }

    // 2. Sending Loop (2 times as requested)
    for (let i = 1; i <= 2; i++) {
        console.log(`\n--- Sending Message ${i}/2 ---`);

        const encodedText = encodeURIComponent(MESSAGE);
        const url = `https://web.whatsapp.com/send?phone=${TEST_PHONE}&text=${encodedText}`;

        console.log(`Navigating to: ${url}`);
        await page.goto(url);

        // Wait for the message input to be populated (or the send button to appear)
        // WhatsApp Web takes a moment to resolve the number and load the chat
        try {
            // Wait for the send button to be clickable
            // Try multiple selectors
            const sendButtonSelector = 'button[aria-label="Send"]';
            await page.waitForSelector(sendButtonSelector, { timeout: 30000 });

            // Small delay to be safe/human-like
            await new Promise(r => setTimeout(r, 2000));

            // Click send
            await page.click(sendButtonSelector);
            console.log("Message sent!");

            // Wait for the message to actually send (tick check or just time delay)
            await new Promise(r => setTimeout(r, 5000));

        } catch (e) {
            console.error(`Failed to send message ${i}:`, e);
            await page.screenshot({ path: `error-send-${i}.png` });
        }
    }

    console.log("\n--- Cycle Complete ---");
    console.log("Closing browser in 5 seconds...");
    await new Promise(r => setTimeout(r, 5000));
    await browser.close();
}

run();
