/**
 * Shared Constants
 *
 * Configuration values shared across worker and frontend.
 */

/** Days before a phone number can be re-contacted */
export const RECONTACT_COOLDOWN_DAYS = 30;

/** All supported outreach markets */
export const SUPPORTED_MARKETS = ['UG', 'US'] as const;
