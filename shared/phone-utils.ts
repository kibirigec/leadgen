/**
 * Phone Utilities
 *
 * Centralized phone number validation and normalization.
 * Used by both the worker and the Next.js frontend.
 * Supports Uganda (UG) and United States (US) markets.
 */

import type { Market } from './types';

/** Uganda country code */
export const UGANDA_COUNTRY_CODE = '256';

/** United States country code */
export const US_COUNTRY_CODE = '1';

/**
 * Validate phone number format
 * Valid if 10-15 digits (international format)
 */
export function isValidPhone(phone: string): boolean {
    const cleaned = phone.replace(/\D/g, '');
    return cleaned.length >= 10 && cleaned.length <= 15;
}

/**
 * Normalize a Uganda phone number to E.164 without the leading +
 * - 0712345678  → 256712345678
 * - 712345678   → 256712345678
 * - 256712345678 → 256712345678 (unchanged)
 */
export function normalizeUGPhone(phone: string): string {
    let cleaned = phone.replace(/\D/g, '');

    // Handle Uganda numbers starting with 0
    if (cleaned.startsWith('0')) {
        cleaned = UGANDA_COUNTRY_CODE + cleaned.slice(1);
    }

    // Handle 9-digit Uganda numbers without any prefix
    if (!cleaned.startsWith(UGANDA_COUNTRY_CODE) && cleaned.length === 9) {
        cleaned = UGANDA_COUNTRY_CODE + cleaned;
    }

    return cleaned;
}

/**
 * Normalize a US phone number to E.164 without the leading +
 * Handles common US formats:
 * - (212) 555-1234   → 12125551234
 * - 212-555-1234     → 12125551234
 * - 212.555.1234     → 12125551234
 * - 2125551234       → 12125551234
 * - +1 212 555 1234  → 12125551234
 * - 12125551234      → 12125551234 (unchanged)
 */
export function normalizeUSPhone(phone: string): string {
    let cleaned = phone.replace(/\D/g, '');

    // Strip leading country code if already present (1XXXXXXXXXX)
    if (cleaned.length === 11 && cleaned.startsWith('1')) {
        return cleaned; // Already in correct format
    }

    // Standard 10-digit US number — prepend country code
    if (cleaned.length === 10) {
        return US_COUNTRY_CODE + cleaned;
    }

    return cleaned;
}

/**
 * Normalize phone number for consistent storage and WhatsApp URLs.
 * Routes to the correct normalizer based on market.
 * Defaults to Uganda normalization for backward compatibility.
 */
export function normalizePhone(phone: string, market?: Market): string {
    if (market === 'US') {
        return normalizeUSPhone(phone);
    }
    // Default: UG
    return normalizeUGPhone(phone);
}
