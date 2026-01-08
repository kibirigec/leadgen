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
    // SPECIAL: PR FIRMS
    {
        businessType: 'pr_firm',
        variants: [
            `Hello👋🏽, My name is Calvin from Weblery, I came across {name} on Google.\n\nI work with PR firms to create websites that clearly present your services and past work, helping potential clients understand what you do before reaching out.\n\nWould having one be useful for {name}?`,
        ],
    },
    // SPECIAL: CHARITY ORGANIZATIONS
    {
        businessType: 'charity',
        variants: [
            `Hello👋🏽, My name is Calvin from Weblery, I came across {name} and was impressed by the work you’re doing.\n\nI work with charitable organizations to create websites that clearly communicate their mission and impact, making it easier for donors and partners to understand your work and contribute directly through the website.\n\nWould having one be useful for {name}?`,
        ],
    },
    // SPECIAL: PRIVATE CLINICS
    {
        businessType: 'private_clinic',
        variants: [
            `Hello👋🏽, My name is Calvin from Weblery, I came across {name} on Google.\n\nI work with clinics to create websites that help patients understand your services and know what to expect before reaching out.\n\nWould having one be useful for {name}?`,
        ],
    },
    // 1. CLINICS / MEDICAL
    {
        businessType: 'clinic',
        variants: [
            `Hello👋🏽, My name is Calvin from Weblery, I came across {name} on Google.\n\nI work with clinics to create websites that help patients understand your services and make it easy to reach out or book appointments.\n\nWould having one be useful for {name}?`,
        ],
    },
    // 2. DENTAL CLINICS
    {
        businessType: 'dental',
        variants: [
            `Hello👋🏽, My name is Calvin from Weblery, I came across {name} on Google.\n\nI work with dental clinics to create websites that help patients understand your services and make it easy to reach out or book appointments.\n\nWould having one be useful for {name}?`,
        ],
    },
    // 3. LAW FIRMS / LEGAL
    {
        businessType: 'law',
        variants: [
            `Hello👋🏽, My name is Calvin from Weblery, I came across {name} on Google.\n\nI work with law firms to create websites that clearly present your services and areas of expertise, helping potential clients understand what you do before reaching out.\n\nWould having one be useful for {name}?`,
        ],
    },
    // 4. SCHOOLS / TRAINING CENTERS
    {
        businessType: 'school',
        variants: [
            `Hello👋🏽, My name is Calvin from Weblery, I came across {name} on Google.\n\nI work with schools and training centers to create websites that clearly present your programs and offerings, making it easier for prospective students and parents to understand and reach out.\n\nWould having one be useful for {name}?`,
        ],
    },
    // 5. REAL ESTATE AGENTS
    {
        businessType: 'realtor',
        variants: [
            `Hello👋🏽, My name is Calvin from Weblery, I came across {name} on Google.\n\nI work with real estate agents to create websites that showcase your listings and services, making it easier for potential buyers and renters to find you and get in touch.\n\nWould having one be useful for {name}?`,
        ],
    },
    // 6. RESTAURANTS
    {
        businessType: 'restaurant',
        variants: [
            `Hello👋🏽, My name is Calvin from Weblery, I came across {name} on Google.\n\nI work with restaurants to create websites that show your menu and offerings clearly, helping diners find you and make reservations or inquiries easily.\n\nWould having one be useful for {name}?`,
        ],
    },
    {
        businessType: 'restaurant_evening',
        variants: [
            `Hello👋🏽, My name is Calvin from Weblery, I came across {name} on Google.\n\nI work with restaurants to create websites that show your menu and offerings clearly, helping diners find you and make reservations or inquiries easily.\n\nWould having one be useful for {name}?`,
        ],
    },
    // 7. BARS / LOUNGES
    {
        businessType: 'bar',
        variants: [
            `Hello👋🏽, My name is Calvin from Weblery, I came across {name} on Google.\n\nI work with bars and lounges to create websites that showcase your offerings and events, making it easier for patrons to find you and reach out.\n\nWould having one be useful for {name}?`,
        ],
    },
    // 8. SALONS & BARBERSHOPS
    {
        businessType: 'salon',
        variants: [
            `Hello👋🏽, My name is Calvin from Weblery, I came across {name} on Google.\n\nI work with salons and barbershops to create websites that clearly show your services and pricing, helping clients find you and book appointments online.\n\nWould having one be useful for {name}?`,
        ],
    },
    // 9. GYMS & FITNESS
    {
        businessType: 'gym',
        variants: [
            `Hello👋🏽, My name is Calvin from Weblery, I came across {name} on Google.\n\nI work with gyms and fitness centers to create websites that present your programs and classes clearly, making it easier for members and prospects to find you and reach out.\n\nWould having one be useful for {name}?`,
        ],
    },
    // 10. PHARMACIES
    {
        businessType: 'pharmacy',
        variants: [
            `Hello👋🏽, My name is Calvin from Weblery, I came across {name} on Google.\n\nI work with pharmacies to create websites that clearly present your products and services, making it easier for customers to find you and contact you directly.\n\nWould having one be useful for {name}?`,
        ],
    },
    // 11. COURIER / DELIVERY
    {
        businessType: 'courier',
        variants: [
            `Hello👋🏽, My name is Calvin from Weblery, I came across {name} on Google.\n\nI work with delivery services to create websites that clearly show your offerings and coverage, making it easier for clients to find you and place requests.\n\nWould having one be useful for {name}?`,
        ],
    },
    // 12. CAR REPAIR / MECHANICS
    {
        businessType: 'mechanic',
        variants: [
            `Hello👋🏽, My name is Calvin from Weblery, I came across {name} on Google.\n\nI work with garages and mechanics to create websites that showcase your services and pricing, making it easier for customers to find you and book appointments or inquiries.\n\nWould having one be useful for {name}?`,
        ],
    },
    // 13. HOTELS / LODGES
    {
        businessType: 'hotel',
        variants: [
            `Hello👋🏽, My name is Calvin from Weblery, I came across {name} on Google.\n\nI work with hotels, lodges, and guesthouses to create websites that clearly show your rooms, services, and availability, helping travelers find you and book directly.\n\nWould having one be useful for {name}?`,
        ],
    },
    // 14. E-COMMERCE / SHOPS
    {
        businessType: 'ecommerce',
        variants: [
            `Hello👋🏽, My name is Calvin from Weblery, I came across {name} on Google.\n\nI work with shops to create websites that showcase your products and services clearly, making it easier for customers to find you and make purchases or inquiries.\n\nWould having one be useful for {name}?`,
        ],
    },
];




/**
 * Format business name to Title Case if all caps
 * "HARK DENTAL CLINIC" -> "Hark Dental Clinic"
 * "Dr. Smith's Clinic" -> "Dr. Smith's Clinic" (unchanged)
 */
function formatBusinessName(name: string): string {
    const letters = name.replace(/[^a-zA-Z]/g, '');
    const uppercaseCount = (name.match(/[A-Z]/g) || []).length;

    if (letters.length > 0 && uppercaseCount / letters.length > 0.8) {
        return name
            .toLowerCase()
            .split(' ')
            .map(word =>
                word
                    .split('-')
                    .map(sub => sub.charAt(0).toUpperCase() + sub.slice(1))
                    .join('-')
            )
            .join(' ');
    }

    return name;
}

/**
 * Get a message for a business type
 * Rotates between variants based on current day
 */
export function getMessage(businessName: string, businessType: string): string {
    const formattedName = formatBusinessName(businessName);
    const template = MESSAGE_TEMPLATES.find(t => t.businessType === businessType);

    if (!template) {
        // Fallback generic message
        return `Hello👋🏽, I found ${formattedName} on Google Maps.\n\nI noticed there's no direct WhatsApp contact page for customers.\n\nI help businesses make it easy for people to reach them.\n\nWould you be open to seeing how this would help ${formattedName}?\n\n- Calvin, Weblery`;
    }

    // Rotate based on day of year
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24));
    const variantIndex = dayOfYear % template.variants.length;
    const message = template.variants[variantIndex];

    return message.replace(/{name}/g, formattedName);
}
