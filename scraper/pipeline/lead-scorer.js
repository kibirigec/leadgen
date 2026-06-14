/**
 * Scores a lead 0-100 based on the rubric.
 */
export function scoreLead(lead) {
  let score = 0;
  
  if (lead.email || (lead.all_emails && lead.all_emails.length > 0)) score += 30;
  if (lead.phone) score += 20;
  
  const platforms = [lead.on_airbnb, lead.on_vrbo, lead.on_booking_com, lead.on_tripadvisor, lead.on_google_maps].filter(Boolean).length;
  
  if (platforms >= 3) score += 15;
  else if (platforms === 2) score += 8;
  
  if (lead.website_quality === 'none') score += 15;
  else if (lead.website_quality === 'broken') score += 8;
  
  if (lead.review_count > 50) score += 10;
  else if (lead.review_count > 20) score += 5;
  
  if (lead.airbnb_listing_count >= 2) score += 10;
  
  if (lead.category === 'bed_and_breakfast') score += 5;
  
  return Math.min(score, 100);
}
