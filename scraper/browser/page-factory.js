import { getBrowser } from './launcher.js';
import { setupRequestFilter } from './request-filter.js';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export async function createFreshPage({ allowStylesheets = false } = {}) {
  const browser = await getBrowser();
  
  const context = await browser.newContext({
    userAgent: USER_AGENT,
    viewport: { width: 1366, height: 768 },
    locale: 'en-US',
    timezoneId: 'America/New_York', // Helps blend in as a US user
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
    }
  });

  const page = await context.newPage();
  
  await setupRequestFilter(page, allowStylesheets);
  
  return { page, context };
}

export async function closePage(context) {
  if (context) {
    await context.close();
  }
}
