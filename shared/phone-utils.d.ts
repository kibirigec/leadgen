/**
 * Phone Utilities
 *
 * Centralized phone number validation and normalization.
 * Used by both the worker and the Next.js frontend.
 */
/** Uganda country code */
export declare const UGANDA_COUNTRY_CODE = "256";
/**
 * Validate phone number format
 * Valid if 10-15 digits (international format)
 */
export declare function isValidPhone(phone: string): boolean;
/**
 * Normalize phone number for consistent storage and WhatsApp URLs
 * Handles Uganda-specific formats:
 * - 0712345678 → 256712345678
 * - 712345678 → 256712345678
 * - 256712345678 → 256712345678 (unchanged)
 */
export declare function normalizePhone(phone: string): string;
