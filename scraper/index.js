import { config } from './config.js';
import { getStats, getLeadsForOutreach, updateOutreachStatus } from './db/leads.js';
import { processLead } from './pipeline/coordinator.js';
import { logger } from './utils/logger.js';
import PQueue from 'p-queue';

import { scrapeGoogleMaps } from './scrapers/google-maps.js';
import { scrapeTripAdvisor } from './scrapers/tripadvisor.js';
import { scrapeAirbnb } from './scrapers/airbnb.js';
import { scrapeVrbo } from './scrapers/vrbo.js';
import { scrapeBookingCom } from './scrapers/booking-com.js';

import { closeBrowser } from './browser/launcher.js';

/**
 * Run the full scraper pipeline.
 */
export async function runScraper(options) {
  const { 
    targets = [], 
    maxResultsPerTarget = config.MAX_RESULTS_PER_TARGET, 
    skipEnrichment = false, 
    dryRun = false,
    concurrency = 1
  } = options;
  
  logger.info({ targets: targets.length, dryRun }, 'Starting scraper run');
  const startTime = Date.now();
  
  const result = {
    total_found: 0,
    passed_filter: 0,
    filtered_out: 0,
    with_email: 0,
    with_phone: 0,
    new_leads: 0,
    updated_leads: 0,
    failed: 0,
    duration_ms: 0,
    top_leads: [],
  };

  const queue = new PQueue({ concurrency });

  try {
    for (const target of targets) {
      let rawLeads = [];
      
      try {
        switch (target.source) {
          case 'google_maps':
            rawLeads = await scrapeGoogleMaps(target.query, maxResultsPerTarget);
            break;
          case 'tripadvisor':
            rawLeads = await scrapeTripAdvisor(target.city, target.state, target.category, maxResultsPerTarget);
            break;
          case 'airbnb':
            rawLeads = await scrapeAirbnb(target.city, target.state);
            break;
          case 'vrbo':
            rawLeads = await scrapeVrbo(target.city, target.state);
            break;
          case 'booking_com':
            rawLeads = await scrapeBookingCom(target.city, target.state);
            break;
          default:
            logger.warn({ source: target.source }, 'Unknown scraper source');
        }
      } catch (err) {
        logger.error({ err, target }, 'Target scraping failed completely');
        continue;
      }
      
      result.total_found += rawLeads.length;
      
      // Process leads through pipeline
      for (const raw of rawLeads) {
        await queue.add(async () => {
          const { lead, action } = await processLead(raw, { skipEnrichment, dryRun });
          
          if (action === 'failed') {
            result.failed++;
          } else {
            if (lead.scrape_status === 'filtered_out') result.filtered_out++;
            else result.passed_filter++;
            
            if (lead.email) result.with_email++;
            if (lead.phone) result.with_phone++;
            
            if (action === 'inserted') result.new_leads++;
            if (action === 'updated') result.updated_leads++;
            
            result.top_leads.push(lead);
          }
        });
      }
    }
    
    await queue.onIdle();
    
    // Sort and truncate top leads
    result.top_leads.sort((a, b) => (b.lead_score || 0) - (a.lead_score || 0));
    result.top_leads = result.top_leads.slice(0, 10);
    
    result.duration_ms = Date.now() - startTime;
    logger.info({ result }, 'Scraper run completed');
    
    return result;
  } finally {
    // Ensure browser is closed
    await closeBrowser();
  }
}

export { getStats, getLeadsForOutreach, updateOutreachStatus };
