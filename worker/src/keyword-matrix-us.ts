/**
 * US Keyword Matrix for Google Maps Scraping
 *
 * US-specific business types and keywords.
 * Adapted from the Uganda matrix with US-standard terminology.
 * - 16 business types
 * - Multiple keywords per type
 * - Daily rotation (1 keyword per type per day)
 */

import type { BusinessType } from './keyword-matrix';

export const US_KEYWORD_MATRIX: BusinessType[] = [
    // MORNING WINDOW (30 leads) - Professional services
    {
        type: 'clinic',
        keywords: ['medical clinic', 'urgent care', 'family practice', 'primary care', 'health clinic', 'outpatient clinic'],
        timeWindow: 'morning',
        dailyQuota: 8,
    },
    {
        type: 'dental',
        keywords: ['dental office', 'dentist', 'dental clinic', 'dental care', 'cosmetic dentist', 'family dentist'],
        timeWindow: 'morning',
        dailyQuota: 6,
    },
    {
        type: 'law',
        keywords: ['law firm', 'attorney', 'law office', 'legal services', 'lawyers'],
        timeWindow: 'morning',
        dailyQuota: 5,
    },
    {
        type: 'realtor',
        keywords: ['real estate agent', 'realtor', 'real estate office', 'property management', 'real estate broker'],
        timeWindow: 'morning',
        dailyQuota: 4,
    },
    {
        type: 'chiropractor',
        keywords: ['chiropractor', 'chiropractic clinic', 'chiropractic care', 'back pain clinic'],
        timeWindow: 'morning',
        dailyQuota: 4,
    },
    {
        type: 'insurance',
        keywords: ['insurance agency', 'insurance agent', 'insurance office', 'auto insurance', 'life insurance'],
        timeWindow: 'morning',
        dailyQuota: 3,
    },

    // LUNCH WINDOW (30 leads) - Lifestyle services
    {
        type: 'restaurant',
        keywords: ['restaurant', 'cafe', 'diner', 'bistro', 'eatery', 'fast casual'],
        timeWindow: 'lunch',
        dailyQuota: 10,
    },
    {
        type: 'salon',
        keywords: ['hair salon', 'beauty salon', 'barbershop', 'barber shop', 'nail salon', 'spa'],
        timeWindow: 'lunch',
        dailyQuota: 8,
    },
    {
        type: 'gym',
        keywords: ['gym', 'fitness center', 'fitness studio', 'personal trainer', 'yoga studio', 'crossfit'],
        timeWindow: 'lunch',
        dailyQuota: 6,
    },
    {
        type: 'pharmacy',
        keywords: ['pharmacy', 'drugstore', 'compounding pharmacy', 'independent pharmacy'],
        timeWindow: 'lunch',
        dailyQuota: 4,
    },
    {
        type: 'coffee',
        keywords: ['coffee shop', 'cafe', 'coffee bar', 'espresso bar', 'independent coffee'],
        timeWindow: 'lunch',
        dailyQuota: 2,
    },

    // EVENING WINDOW (40 leads) - Leisure & utilities
    {
        type: 'bar',
        keywords: ['bar', 'lounge', 'pub', 'sports bar', 'cocktail bar', 'wine bar'],
        timeWindow: 'evening',
        dailyQuota: 10,
    },
    {
        type: 'mechanic',
        keywords: ['auto repair', 'auto shop', 'car repair', 'mechanic', 'auto service', 'tire shop'],
        timeWindow: 'evening',
        dailyQuota: 8,
    },
    {
        type: 'hotel',
        keywords: ['hotel', 'motel', 'bed and breakfast', 'inn', 'boutique hotel'],
        timeWindow: 'evening',
        dailyQuota: 7,
    },
    {
        type: 'ecommerce',
        keywords: ['retail store', 'clothing boutique', 'electronics store', 'gift shop', 'specialty shop'],
        timeWindow: 'evening',
        dailyQuota: 7,
    },
    {
        type: 'restaurant_evening',
        keywords: ['restaurant', 'steakhouse', 'seafood restaurant', 'pizza', 'sushi'],
        timeWindow: 'evening',
        dailyQuota: 8,
    },
];
