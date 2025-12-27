/**
 * Phone Utilities
 *
 * Centralized phone number validation and normalization.
 * Used by both the worker and the Next.js frontend.
 */

/** Uganda country code */
export const UGANDA_COUNTRY_CODE = '256';

/**
 * Validate phone number format
 * Valid if 10-15 digits (international format)
 */
export function isValidPhone(phone: string): boolean {
    const cleaned = phone.replace(/\D/g, '');
    return cleaned.length >= 10 && cleaned.length <= 15;
}

/**
 * Normalize phone number for consistent storage and WhatsApp URLs
 * Handles Uganda-specific formats:
 * - 0712345678 → 256712345678
 * - 712345678 → 256712345678
 * - 256712345678 → 256712345678 (unchanged)
 */
export function normalizePhone(phone: string): string {
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
