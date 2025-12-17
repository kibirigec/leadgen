/**
 * Outreach Configuration
 * 
 * Business types mapped to time windows with daily quotas
 * City rotation for Uganda geo-targeting
 */

// ============================================
// TIME WINDOW DEFINITIONS
// ============================================

export type TimeWindow = "morning" | "lunch" | "evening";

export interface BusinessTypeConfig {
    type: string;
    keywords: string[];
    dailyQuota: number;
}

export interface TimeWindowConfig {
    window: TimeWindow;
    startTime: string;  // HH:MM in EAT (UTC+3)
    endTime: string;
    totalMessages: number;
    businessTypes: BusinessTypeConfig[];
}

export const TIME_WINDOWS: TimeWindowConfig[] = [
    {
        window: "morning",
        startTime: "06:30",
        endTime: "07:00",
        totalMessages: 30,
        businessTypes: [
            { type: "clinic", keywords: ["clinic", "medical center", "health center", "hospital"], dailyQuota: 10 },
            { type: "dental", keywords: ["dental clinic", "dentist", "dental surgery"], dailyQuota: 8 },
            { type: "law", keywords: ["law firm", "advocate", "lawyer", "legal services"], dailyQuota: 5 },
            { type: "school", keywords: ["school", "training center", "academy", "college"], dailyQuota: 4 },
            { type: "realtor", keywords: ["real estate agent", "property agent", "real estate"], dailyQuota: 3 },
        ],
    },
    {
        window: "lunch",
        startTime: "12:30",
        endTime: "14:00",
        totalMessages: 30,
        businessTypes: [
            { type: "restaurant", keywords: ["restaurant", "cafe", "eatery", "food"], dailyQuota: 10 },
            { type: "salon", keywords: ["salon", "barbershop", "spa", "beauty"], dailyQuota: 8 },
            { type: "gym", keywords: ["gym", "fitness center", "fitness"], dailyQuota: 6 },
            { type: "pharmacy", keywords: ["pharmacy", "chemist", "drug store"], dailyQuota: 4 },
            { type: "courier", keywords: ["courier", "delivery service", "logistics"], dailyQuota: 2 },
        ],
    },
    {
        window: "evening",
        startTime: "19:30",
        endTime: "20:15",
        totalMessages: 40,
        businessTypes: [
            { type: "bar", keywords: ["bar", "lounge", "nightclub", "pub"], dailyQuota: 10 },
            { type: "restaurant_evening", keywords: ["restaurant", "grill", "rolex stand"], dailyQuota: 8 },
            { type: "clinic_evening", keywords: ["clinic", "pharmacy"], dailyQuota: 6 },
            { type: "mechanic", keywords: ["garage", "auto repair", "mechanic", "car wash"], dailyQuota: 6 },
            { type: "hotel", keywords: ["hotel", "lodge", "guest house", "airbnb"], dailyQuota: 5 },
            { type: "realtor_evening", keywords: ["real estate", "property", "apartments"], dailyQuota: 5 },
        ],
    },
];

// ============================================
// CITY ROTATION CONFIGURATION
// ============================================

export const CITY_TIERS = {
    tier1: ["Kampala", "Entebbe", "Jinja", "Mbarara", "Gulu", "Mbale", "Arua", "Fort Portal"],
    tier2: ["Mukono", "Masaka", "Lira", "Soroti", "Hoima", "Kabale", "Kasese", "Tororo", "Wakiso", "Busia"],
    tier3: ["Ntinda", "Bugolobi", "Muyenga", "Kololo", "Namugongo", "Kyaliwajjala", "Bweyogerere", "Kireka", "Seeta"],
    tier4: ["Mityana", "Mubende", "Kyenjojo", "Masindi", "Apac", "Kitgum", "Ntungamo", "Rakai", "Kayunga"],
};

// Day of week: 0 = Sunday, 1 = Monday, etc.
export const WEEKLY_ROTATION: Record<number, string[]> = {
    0: ["Ntinda", "Bugolobi", "Muyenga", "Kololo"],  // Sunday - Tier 3 only
    1: ["Kampala", "Entebbe"],                        // Monday
    2: ["Jinja", "Mukono"],                           // Tuesday
    3: ["Mbarara", "Masaka"],                         // Wednesday
    4: ["Gulu", "Lira"],                              // Thursday
    5: ["Mbale", "Soroti"],                           // Friday
    6: ["Fort Portal", "Kasese"],                     // Saturday
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get cities for today based on rotation schedule
 */
export function getTodaysCities(): string[] {
    const dayOfWeek = new Date().getDay();
    return WEEKLY_ROTATION[dayOfWeek] || WEEKLY_ROTATION[0];
}

/**
 * Get all business types for a specific time window
 */
export function getBusinessTypesForWindow(window: TimeWindow): BusinessTypeConfig[] {
    const config = TIME_WINDOWS.find(tw => tw.window === window);
    return config?.businessTypes || [];
}

/**
 * Get total messages for a time window
 */
export function getWindowMessageCount(window: TimeWindow): number {
    const config = TIME_WINDOWS.find(tw => tw.window === window);
    return config?.totalMessages || 0;
}

/**
 * Calculate scrape quota (3x buffer for filtering)
 */
export function getScrapeQuota(dailyQuota: number): number {
    return dailyQuota * 3;
}

// ============================================
// DAILY VOLUME SETTINGS (ADJUSTABLE)
// ============================================

export const DAILY_SETTINGS = {
    // Total messages per day (start lower, scale up)
    totalDailyMessages: 100,

    // Scrape multiplier (3x = 300 leads for 100 messages)
    scrapeMultiplier: 3,

    // Minimum rating to include (1-5)
    minRating: 3.5,

    // Days before a phone can be re-contacted
    recontactCooldownDays: 30,
};
