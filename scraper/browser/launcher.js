import { chromium } from 'playwright-extra';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

// Apply stealth plugin
chromium.use(stealthPlugin());

let browserInstance = null;

export async function getBrowser() {
  if (browserInstance) return browserInstance;
  
  logger.info('Launching persistent browser instance');
  browserInstance = await chromium.launch({
    headless: config.BROWSER_HEADLESS,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
    ]
  });
  
  return browserInstance;
}

export async function closeBrowser() {
  if (browserInstance) {
    logger.info('Closing browser instance');
    await browserInstance.close();
    browserInstance = null;
  }
}
