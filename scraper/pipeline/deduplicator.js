import { slugify } from '../utils/text-cleaner.js';

/**
 * Generates a unique deduplication key for a lead.
 * Priority: google_place_id > name_slug+city+state
 */
export function generateDedupKey(lead) {
  if (lead.google_place_id) {
    return `gplace_${lead.google_place_id}`;
  }
  
  const nameSlug = slugify(lead.business_name || '');
  const citySlug = slugify(lead.city || '');
  const stateSlug = slugify(lead.state || '');
  
  return `${nameSlug}_${citySlug}_${stateSlug}`;
}
