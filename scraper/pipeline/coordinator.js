import { checkWebsite } from '../enrichment/website-checker.js';
import { huntEmails } from '../enrichment/email-hunter.js';
import { filterLead } from './website-filter.js';
import { scoreLead } from './lead-scorer.js';
import { upsertLead } from '../db/leads.js';
import { logger } from '../utils/logger.js';
import { normalizePhone } from '../enrichment/phone-normalizer.js';

export async function processLead(rawLead, { skipEnrichment = false, dryRun = false }) {
  try {
    // 1. Initial cleanup & dedup key
    const lead = { ...rawLead };
    lead.first_seen_at = new Date().toISOString();
    lead.updated_at = lead.first_seen_at;
    lead.scrape_status = 'pending';
    lead.enrichment_status = 'pending';
    
    // Calculate platform count
    lead.platform_count = [lead.on_airbnb, lead.on_vrbo, lead.on_booking_com, lead.on_tripadvisor, lead.on_google_maps].filter(Boolean).length;
    
    if (lead.phone) {
      lead.phone_raw = lead.phone;
      lead.phone = normalizePhone(lead.phone);
    }

    // 2. Website Check
    if (lead.website_url) {
      lead.website_quality = await checkWebsite(lead.website_url);
    } else {
      lead.website_quality = 'none';
    }
    lead.website_checked_at = new Date().toISOString();

    // 3. Website Filter
    const filterResult = filterLead(lead);
    if (!filterResult.passed) {
      lead.scrape_status = 'filtered_out';
      lead.filter_reason = filterResult.reason;
    } else {
      lead.scrape_status = 'pending'; // Passed filter
    }

    // 4. Enrichment
    if (lead.scrape_status !== 'filtered_out' && !skipEnrichment) {
      const enrichmentResult = await huntEmails(lead);
      lead.all_emails = enrichmentResult.all_emails;
      lead.email = lead.all_emails.length > 0 ? lead.all_emails[0] : null;
      lead.phone = enrichmentResult.phone || lead.phone;
      lead.email_sources = enrichmentResult.email_sources;
      if (enrichmentResult.contact_page_url) {
         lead.contact_page_url = enrichmentResult.contact_page_url;
      }
      
      lead.enrichment_status = 'complete';
      lead.enriched_at = new Date().toISOString();
      lead.scrape_status = 'enriched';
    }

    // 5. Score
    lead.lead_score = scoreLead(lead);

    // 6. DB Insert
    if (!dryRun) {
      const dbRes = await upsertLead(lead);
      return { lead, action: dbRes.action };
    } else {
      return { lead, action: 'dry_run' };
    }
  } catch (err) {
    logger.error({ err, lead: rawLead.business_name }, 'Failed to process lead');
    return { lead: rawLead, action: 'failed' };
  }
}
