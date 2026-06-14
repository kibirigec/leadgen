import { config } from '../config.js';

/**
 * Wait for a random number of milliseconds between min and max.
 */
export async function randomDelay(min = config.MIN_DELAY_MS, max = config.MAX_DELAY_MS) {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Scroll a playwright page in human-like steps.
 */
export async function humanScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = Math.floor(Math.random() * 300) + 300; // 300 - 600px
      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;

        if (totalHeight >= scrollHeight) {
          clearInterval(timer);
          resolve();
        }
      }, Math.floor(Math.random() * 300) + 200); // 200 - 500ms
    });
  });
}

/**
 * Exponential backoff delay: 5000ms * attempt
 */
export async function backoff(attempt) {
  const ms = attempt * 5000;
  return new Promise(resolve => setTimeout(resolve, ms));
}
