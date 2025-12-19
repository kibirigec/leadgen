/**
 * Message Templates for WhatsApp Outreach
 * 
 * - 13 business types
 * - 2 rotating variants per type
 * - Professional, concise messaging
 * - Placeholder: {name} = business name
 */

export interface MessageTemplate {
    businessType: string;
    variants: string[];
}

export const MESSAGE_TEMPLATES: MessageTemplate[] = [
    // 1. CLINICS / MEDICAL
    {
        businessType: 'clinic',
        variants: [
            `Hi, I came across {name} on Google Maps. I help clinics set up automatic replies so people looking for care can reach them at any time.\n\nWould you be open to a quick 1-minute demo made for your clinic?`,
            `Hello, I found {name} on Google Maps. I help clinics set up automatic replies so people needing medical services can reach them at any time.\n\nWould you be open to seeing a short demo built for your clinic?`,
        ],
    },
    // 2. DENTAL CLINICS
    {
        businessType: 'dental',
        variants: [
            `Hi, I came across {name} on Google Maps. I help dental practices set up automatic replies so clients needing dental care can reach them at any time.\n\nWould you be open to a quick 1-minute demo made for your practice?`,
            `Hello, I found {name} on Google Maps. I help dental practices set up automatic replies so people looking for dental services can reach them at any time.\n\nWould you be open to seeing a short demo built for your clinic?`,
        ],
    },
    // 3. LAW FIRMS / LEGAL
    {
        businessType: 'law',
        variants: [
            `Hi, I came across {name} on Google Maps. I help legal practices set up automatic replies so potential clients can reach them at any time.\n\nWould you be open to a quick 1-minute demo made for your firm?`,
            `Hello, I found {name} on Google Maps. I help law firms set up automatic replies so potential clients can reach them at any time.\n\nWould you be open to seeing a short demo built for your firm?`,
        ],
    },
    // 4. SCHOOLS / TRAINING CENTERS
    {
        businessType: 'school',
        variants: [
            `Hi, I came across {name} on Google Maps. I help schools and training centers set up automatic replies so prospective students can reach them at any time.\n\nWould you be open to a quick 1-minute demo made for your center?`,
            `Hello, I found {name} on Google Maps. I help schools and training centers set up automatic replies so interested students can reach them at any time.\n\nWould you be open to seeing a short demo built for your institution?`,
        ],
    },
    // 5. REAL ESTATE AGENTS
    {
        businessType: 'realtor',
        variants: [
            `Hi, I came across {name} on Google Maps. I help real estate agents set up automatic replies so potential clients can reach them at any time.\n\nWould you be open to a quick 1-minute demo made for your listings?`,
            `Hello, I found {name} on Google Maps. I help real estate agents set up automatic replies so potential buyers and renters can reach them at any time.\n\nWould you be open to seeing a short demo built for your agency?`,
        ],
    },
    // 6. RESTAURANTS
    {
        businessType: 'restaurant',
        variants: [
            `Hi, I came across {name} on Google Maps. I help restaurants set up automatic replies so customers can reach them at any time.\n\nWould you be open to a quick 1-minute demo made for your restaurant?`,
            `Hello, I found {name} on Google Maps. I help restaurants set up automatic replies so diners can reach them at any time.\n\nWould you be open to seeing a short demo built for your restaurant?`,
        ],
    },
    // Also for evening restaurant window
    {
        businessType: 'restaurant_evening',
        variants: [
            `Hi, I came across {name} on Google Maps. I help restaurants set up automatic replies so customers can reach them at any time.\n\nWould you be open to a quick 1-minute demo made for your restaurant?`,
            `Hello, I found {name} on Google Maps. I help restaurants set up automatic replies so diners can reach them at any time.\n\nWould you be open to seeing a short demo built for your restaurant?`,
        ],
    },
    // 7. BARS / LOUNGES
    {
        businessType: 'bar',
        variants: [
            `Hi, I came across {name} on Google Maps. I help bars and lounges set up automatic replies so customers can reach them at any time.\n\nWould you be open to a quick 1-minute demo made for your bar?`,
            `Hello, I found {name} on Google Maps. I help bars and lounges set up automatic replies so patrons can reach them at any time.\n\nWould you be open to seeing a short demo built for your venue?`,
        ],
    },
    // 8. SALONS & BARBERSHOPS
    {
        businessType: 'salon',
        variants: [
            `Hi, I came across {name} on Google Maps. I help salons and barbershops set up automatic replies so clients can reach them at any time.\n\nWould you be open to a quick 1-minute demo made for your salon?`,
            `Hello, I found {name} on Google Maps. I help salons and barbershops set up automatic replies so customers can reach them at any time.\n\nWould you be open to seeing a short demo built for your shop?`,
        ],
    },
    // 9. GYMS & FITNESS
    {
        businessType: 'gym',
        variants: [
            `Hi, I came across {name} on Google Maps. I help gyms and fitness centers set up automatic replies so members can reach them at any time.\n\nWould you be open to a quick 1-minute demo made for your gym?`,
            `Hello, I found {name} on Google Maps. I help gyms and fitness centers set up automatic replies so prospective members can reach them at any time.\n\nWould you be open to seeing a short demo built for your facility?`,
        ],
    },
    // 10. PHARMACIES
    {
        businessType: 'pharmacy',
        variants: [
            `Hi, I came across {name} on Google Maps. I help pharmacies set up automatic replies so customers can reach them at any time.\n\nWould you be open to a quick 1-minute demo made for your pharmacy?`,
            `Hello, I found {name} on Google Maps. I help pharmacies set up automatic replies so people needing medicines can reach them at any time.\n\nWould you be open to seeing a short demo built for your store?`,
        ],
    },
    // 11. COURIER / DELIVERY
    {
        businessType: 'courier',
        variants: [
            `Hi, I came across {name} on Google Maps. I help delivery businesses set up automatic replies so customers can reach them at any time.\n\nWould you be open to a quick 1-minute demo made for your service?`,
            `Hello, I found {name} on Google Maps. I help delivery businesses set up automatic replies so clients can reach them at any time.\n\nWould you be open to seeing a short demo built for your company?`,
        ],
    },
    // 12. CAR REPAIR / MECHANICS
    {
        businessType: 'mechanic',
        variants: [
            `Hi, I came across {name} on Google Maps. I help mechanics and auto repair shops set up automatic replies so customers can reach them at any time.\n\nWould you be open to a quick 1-minute demo made for your garage?`,
            `Hello, I found {name} on Google Maps. I help mechanics and auto repair shops set up automatic replies so people needing repairs can reach them at any time.\n\nWould you be open to seeing a short demo built for your shop?`,
        ],
    },
    // 13. HOTELS / LODGES
    {
        businessType: 'hotel',
        variants: [
            `Hi, I came across {name} on Google Maps. I help hotels, lodges, and guesthouses set up automatic replies so guests can reach them at any time.\n\nWould you be open to a quick 1-minute demo made for your property?`,
            `Hello, I found {name} on Google Maps. I help hotels, lodges, and guesthouses set up automatic replies so travelers can reach them at any time.\n\nWould you be open to seeing a short demo built for your lodge?`,
        ],
    },
    // 14. E-COMMERCE / SHOPS
    {
        businessType: 'ecommerce',
        variants: [
            `Hi, I came across {name} on Google Maps. I help shops set up automatic replies so customers can reach them at any time.\n\nWould you be open to a quick 1-minute demo made for your store?`,
            `Hello, I found {name} on Google Maps. I help shops set up automatic replies so buyers can reach them at any time.\n\nWould you be open to seeing a short demo built for your business?`,
        ],
    },
];

/**
 * Get a message for a business type
 * Rotates between variants based on current day
 */
export function getMessage(businessName: string, businessType: string): string {
    const template = MESSAGE_TEMPLATES.find(t => t.businessType === businessType);

    if (!template) {
        // Fallback generic message
        return `Hi, I came across ${businessName} on Google Maps. I help businesses set up automatic replies so customers can reach them at any time.\n\nWould you be open to a quick 1-minute demo?`;
    }

    // Rotate based on day of year
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24));
    const variantIndex = dayOfYear % template.variants.length;
    const message = template.variants[variantIndex];

    return message.replace(/{name}/g, businessName);
}
