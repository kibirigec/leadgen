import axios from 'axios';
import * as cheerio from 'cheerio';
import { logger } from '../utils/logger.js';
import { config } from '../config.js';

const BOOKING_INDICATORS = [
  'book now', 'reserve', 'check availability',
  'rezovation', 'cloudbeds', 'lodgify',
  'thinkreservations', 'bookingsync', 'checkfront',
  'littlehotelier', 'freetobook', 'eviivo'
];

/**
 * Checks a website URL and categorises its quality.
 * Returns: 'none' | 'broken' | 'basic' | 'has_booking'
 */
export async function checkWebsite(url) {
  if (!url) return 'none';

  try {
    const response = await axios.get(url, {
      timeout: config.REQUEST_TIMEOUT_MS,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0 Safari/537.36'
      },
      validateStatus: () => true // Resolve on any status code
    });

    if (response.status >= 400) {
      return 'broken';
    }

    const html = response.data;
    if (typeof html !== 'string') {
      return 'broken';
    }

    const $ = cheerio.load(html);
    
    // Check for Facebook redirect or Linktree
    const title = $('title').text().toLowerCase();
    if (title.includes('facebook') || url.includes('linktr.ee') || url.includes('facebook.com')) {
      return 'basic'; // Not a real standalone website
    }

    // Check for booking widgets/iframes/scripts
    const pageText = $('body').text().toLowerCase();
    const htmlLower = html.toLowerCase();
    
    for (const indicator of BOOKING_INDICATORS) {
      if (htmlLower.includes(indicator) || pageText.includes(indicator)) {
        return 'has_booking';
      }
    }

    // Check for 3+ pages of real content (nav links)
    const internalLinks = new Set();
    const urlObj = new URL(url);
    const domain = urlObj.hostname;

    $('a[href]').each((i, el) => {
      const href = $(el).attr('href');
      if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
      
      try {
        const linkObj = new URL(href, url);
        if (linkObj.hostname === domain) {
          internalLinks.add(linkObj.pathname);
        }
      } catch (e) {
        // Invalid URL, ignore
      }
    });

    if (internalLinks.size > 3) {
      // It's a proper site, but didn't trigger booking indicators
      return 'basic';
    }

    return 'basic';

  } catch (error) {
    logger.debug({ url, err: error.message }, 'Website check failed');
    return 'broken';
  }
}
