/**
 * Master Keyword Matrix for Google Maps Scraping
 * 
 * - 14 business types
 * - Multiple keywords per type
 * - Daily rotation (1 keyword per type per day)
 * - 7-day cooldown per (keyword + suburb + city)
 */

export interface BusinessType {
    type: string;
    keywords: string[];
    timeWindow: 'morning' | 'lunch' | 'evening';
    dailyQuota: number;
}

export const KEYWORD_MATRIX: BusinessType[] = [
    // MORNING WINDOW (30 leads) - Professional services
    {
        type: 'clinic',
        keywords: ['clinic', 'medical center', 'health clinic', 'private clinic', 'family clinic', 'outpatient clinic'],
        timeWindow: 'morning',
        dailyQuota: 10,
    },
    {
        type: 'dental',
        keywords: ['dental clinic', 'dentist', 'dental care', 'dental center', 'dental services'],
        timeWindow: 'morning',
        dailyQuota: 8,
    },
    {
        type: 'law',
        keywords: ['law firm', 'lawyers', 'advocates', 'legal services', 'law office'],
        timeWindow: 'morning',
        dailyQuota: 5,
    },
    {
        type: 'school',
        keywords: ['training center', 'vocational institute', 'computer school', 'driving school', 'skills training', 'private school'],
        timeWindow: 'morning',
        dailyQuota: 4,
    },
    {
        type: 'realtor',
        keywords: ['real estate agent', 'property agent', 'real estate office', 'property consultant', 'land broker'],
        timeWindow: 'morning',
        dailyQuota: 3,
    },

    // LUNCH WINDOW (30 leads) - Lifestyle services
    {
        type: 'restaurant',
        keywords: ['restaurant', 'eatery', 'food place', 'fast food', 'grill', 'takeaway'],
        timeWindow: 'lunch',
        dailyQuota: 10,
    },
    {
        type: 'salon',
        keywords: ['salon', 'hair salon', 'beauty salon', 'barbershop', 'barber'],
        timeWindow: 'lunch',
        dailyQuota: 8,
    },
    {
        type: 'gym',
        keywords: ['gym', 'fitness center', 'fitness gym', 'workout gym', 'body fitness'],
        timeWindow: 'lunch',
        dailyQuota: 6,
    },
    {
        type: 'pharmacy',
        keywords: ['pharmacy', 'drug shop', 'chemist', 'medical store'],
        timeWindow: 'lunch',
        dailyQuota: 4,
    },
    {
        type: 'courier',
        keywords: ['courier service', 'delivery service', 'logistics company', 'parcel delivery', 'express delivery'],
        timeWindow: 'lunch',
        dailyQuota: 2,
    },

    // EVENING WINDOW (40 leads) - Leisure & utilities
    {
        type: 'bar',
        keywords: ['bar', 'lounge', 'pub', 'nightclub', 'sports bar', 'cocktail bar'],
        timeWindow: 'evening',
        dailyQuota: 10,
    },
    {
        type: 'mechanic',
        keywords: ['car repair', 'garage', 'auto repair', 'mechanic', 'vehicle service'],
        timeWindow: 'evening',
        dailyQuota: 8,
    },
    {
        type: 'hotel',
        keywords: ['hotel', 'lodge', 'guest house', 'inn', 'accommodation'],
        timeWindow: 'evening',
        dailyQuota: 7,
    },
    {
        type: 'ecommerce',
        keywords: ['online shop', 'online store', 'electronics shop', 'phone shop', 'clothing shop'],
        timeWindow: 'evening',
        dailyQuota: 7,
    },
    {
        type: 'restaurant_evening',
        keywords: ['restaurant', 'grill', 'eatery', 'food place'],
        timeWindow: 'evening',
        dailyQuota: 8,
    },
];

/**
 * Get today's keyword for a business type
 * Rotates daily through available keywords
 */
export function getTodaysKeyword(businessType: BusinessType): string {
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24));
    const keywordIndex = dayOfYear % businessType.keywords.length;
    return businessType.keywords[keywordIndex];
}

/**
 * Get all business types for a time window
 */
export function getBusinessTypesForWindow(window: 'morning' | 'lunch' | 'evening'): BusinessType[] {
    return KEYWORD_MATRIX.filter(bt => bt.timeWindow === window);
}

/**
 * Get window quotas
 */
export const WINDOW_QUOTAS = {
    morning: 30,
    lunch: 30,
    evening: 40,
};
