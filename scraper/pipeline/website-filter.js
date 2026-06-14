/**
 * Validates if a lead passes the website gate.
 * @returns {{passed: boolean, reason?: string}}
 */
export function filterLead(lead) {
  if (lead.website_quality === 'has_booking') {
    return { passed: false, reason: 'Has booking widget' };
  }
  
  if (['none', 'broken', 'basic'].includes(lead.website_quality)) {
    return { passed: true };
  }
  
  // Failsafe
  return { passed: true };
}
