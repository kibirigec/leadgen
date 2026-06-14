import { createFreshPage, closePage } from '../browser/page-factory.js';
import { randomDelay, humanScroll } from '../utils/delay.js';
import { logger } from '../utils/logger.js';
import { generateDedupKey } from '../pipeline/deduplicator.js';

export async function scrapeGoogleMaps(query, maxResults) {
  const results = [];
  let context;
  try {
    const { page, context: ctx } = await createFreshPage();
    context = ctx;
    
    await page.waitForLoadState('networkidle');
    await randomDelay();

    // Handle cookie consent dialog if it appears
    try {
      const consentButton = await page.$('button:has-text("Accept all"), button:has-text("Reject all")');
      if (consentButton) {
        logger.info('Consent popup detected, attempting to dismiss');
        await consentButton.click();
        await randomDelay(1000, 2000);
      }
    } catch (e) {
      // Ignore if no consent popup
    }

    // Fill search input with fallback selectors
    let searchInput;
    try {
      await page.waitForSelector('input#searchboxinput', { state: 'visible', timeout: 45000 });
      searchInput = await page.$('input#searchboxinput');
    } catch {
      // Try alternative selectors used by Google Maps UI variations
      const fallbackSelectors = [
        'input[aria-label="Search"]',
        'input[placeholder="Search"]',
        'input[aria-label="Search Google Maps"]',
      ];
      for (const sel of fallbackSelectors) {
        try {
          await page.waitForSelector(sel, { state: 'visible', timeout: 15000 });
          searchInput = await page.$(sel);
          break;
        } catch {}
      }
    }
    if (!searchInput) {
      logger.warn('Search input not found, aborting Google Maps scrape');
      return results;
    }
    await searchInput.fill(query);
    await searchInput.press('Enter');
    
    // Wait for feed
    try {
      await page.waitForSelector('div[role="feed"]', { timeout: 20000 });
    } catch (e) {
      logger.warn('Google maps feed not found or CAPTCHA. Check if blocked.');
      return results;
    }

    // Scroll feed
    let lastResultCount = 0;
    let noNewResultsCount = 0;
    
    while (results.length < maxResults) {
      await humanScroll(page);
      
      const links = await page.$$eval('a[href*="/maps/place/"]', els => els.map(el => el.href));
      const uniqueLinks = [...new Set(links)];
      
      if (uniqueLinks.length === lastResultCount) {
        noNewResultsCount++;
      } else {
        noNewResultsCount = 0;
      }
      
      lastResultCount = uniqueLinks.length;
      
      const endReached = await page.evaluate(() => {
        return document.body.innerText.includes("You've reached the end of the list");
      });

      if (noNewResultsCount >= 3 || endReached || uniqueLinks.length >= maxResults) {
        for (const link of uniqueLinks.slice(0, maxResults)) {
           results.push({ url: link });
        }
        break;
      }
    }

    const detailedResults = [];
    for (const item of results) {
       const detail = await scrapePlaceDetail(item.url, ctx);
       if (detail) detailedResults.push(detail);
       await randomDelay(800, 1800);
    }
    
    return detailedResults;
  } catch (err) {
    logger.error({ err }, 'Google Maps scraper failed');
    return results;
  } finally {
    if (context) await closePage(context);
  }
}

async function scrapePlaceDetail(url, browserContext) {
  let context;
  try {
    const { page, context: ctx } = await createFreshPage();
    context = ctx;
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await randomDelay(1000, 2000);

    // Name
    let name = await page.$eval('h1', el => el.textContent).catch(() => '');
    
    // Category
    let category = await page.$eval('button[jsaction="pane.rating.category"]', el => el.textContent).catch(() => '');
    
    // Address
    let address = await page.$eval('[data-item-id="address"]', el => el.getAttribute('aria-label')).catch(() => '');
    if (address && address.startsWith('Address: ')) address = address.replace('Address: ', '');

    // Phone
    let phone = await page.$eval('[data-item-id^="phone:"]', el => el.getAttribute('aria-label')).catch(() => null);
    if (phone && phone.startsWith('Phone: ')) phone = phone.replace('Phone: ', '');

    // Website
    let website = await page.$eval('[data-item-id="authority"]', el => el.getAttribute('href')).catch(() => null);

    // Rating
    let rating = await page.$eval('span[aria-label*="stars"]', el => el.getAttribute('aria-label')).catch(() => null);
    if (rating) {
      const match = rating.match(/([\d.]+)\s+stars/);
      if (match) rating = parseFloat(match[1]);
    }

    // Coordinates
    let lat, lng;
    const urlMatch = page.url().match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (urlMatch) {
      lat = parseFloat(urlMatch[1]);
      lng = parseFloat(urlMatch[2]);
    }

    // Place ID
    let placeId = null;
    const cidMatch = url.match(/data=.*!3m1!4b1!4m5!3m4!1s([^!]+)/);
    if (cidMatch) placeId = cidMatch[1];
    
    const lead = {
      business_name: name,
      category: category,
      address,
      phone_raw: phone,
      phone,
      website_url: website,
      has_website: !!website,
      rating,
      lat,
      lng,
      google_maps_url: url,
      on_google_maps: true,
      google_place_id: placeId,
      scrape_source: 'google_maps',
      city: address ? address.split(',')[1]?.trim() : '',
      state: address ? address.split(',')[2]?.trim()?.split(' ')[0] : '',
    };
    
    lead.dedup_key = generateDedupKey(lead);
    return lead;
  } catch (e) {
    logger.error({ err: e, url }, 'Failed to scrape place detail');
    return null;
  } finally {
     if (context) await closePage(context);
  }
}
