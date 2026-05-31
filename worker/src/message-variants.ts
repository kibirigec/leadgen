/**
 * Message Templates for WhatsApp Outreach
 *
 * - 14+ business types
 * - 2 variants per type: UG (Uganda) and US (United States)
 * - Professional, concise messaging
 * - Placeholder: {name} = business name
 */

import type { Market } from '../../shared/types';

export interface MessageTemplate {
    businessType: string;
    variants: string[];          // UG variants (existing)
    usVariants?: string[];       // US variants (new)
}

export const MESSAGE_TEMPLATES: MessageTemplate[] = [
    // SPECIAL: PR FIRMS
    {
        businessType: 'pr_firm',
        variants: [
            `Hello👋🏽, My name is Calvin from Weblery, I came across {name} on Google.\n\nI work with PR firms to create websites that clearly present your services and past work, helping potential clients understand what you do before reaching out.\n\nWould having one be useful for {name}?`,
        ],
        usVariants: [
            `Hi 👋 — my name is Calvin from Weblery. I came across {name} on Google.\n\nI help PR agencies build clean, professional websites that showcase your services and client work, making it easier for prospects to evaluate you before reaching out.\n\nWould that be something useful for {name}?`,
        ],
    },
    // SPECIAL: CHARITY ORGANIZATIONS
    {
        businessType: 'charity',
        variants: [
            `Hello👋🏽, My name is Calvin from Weblery, I came across {name} and was impressed by the work you're doing.\n\nI work with charitable organizations to create websites that clearly communicate their mission and impact, making it easier for donors and partners to understand your work and contribute directly through the website.\n\nWould having one be useful for {name}?`,
        ],
        usVariants: [
            `Hi 👋 — my name is Calvin from Weblery. I came across {name} and wanted to reach out.\n\nI help nonprofits and charitable organizations build websites that clearly communicate their mission and make it easy for donors to contribute online.\n\nWould that be valuable for {name}?`,
        ],
    },
    // 1. CLINICS / MEDICAL
    {
        businessType: 'clinic',
        variants: [
            `Hello👋🏽, My name is Calvin from Weblery, I came across {name} on Google.\n\nI work with clinics to create websites that help patients understand your services and make it easy to reach out or book appointments.\n\nWould having one be useful for {name}?`,
        ],
        usVariants: [
            `Hi 👋 — my name is Calvin from Weblery. I came across {name} on Google.\n\nI help medical practices build professional websites that clearly explain your services and make it simple for patients to contact you or request an appointment.\n\nWould that be helpful for {name}?`,
        ],
    },
    // SPECIAL: PRIVATE CLINICS
    {
        businessType: 'private_clinic',
        variants: [
            `Hello👋🏽, My name is Calvin from Weblery, I came across {name} on Google.\n\nI work with clinics to create websites that help patients understand your services and know what to expect before reaching out.\n\nWould having one be useful for {name}?`,
        ],
        usVariants: [
            `Hi 👋 — my name is Calvin from Weblery. I came across {name} on Google.\n\nI help private practices build websites that give patients a clear picture of your services before they call, reducing back-and-forth and improving conversions.\n\nWould that be useful for {name}?`,
        ],
    },
    // 2. DENTAL CLINICS
    {
        businessType: 'dental',
        variants: [
            `Hello👋🏽, My name is Calvin from Weblery, I came across {name} on Google.\n\nI work with dental clinics to create websites that help patients understand your services and make it easy to reach out or book appointments.\n\nWould having one be useful for {name}?`,
        ],
        usVariants: [
            `Hi 👋 — my name is Calvin from Weblery. I found {name} on Google.\n\nI help dental offices build clean websites that show your services, answer common patient questions, and make it easy to schedule appointments online.\n\nWould that be a good fit for {name}?`,
        ],
    },
    // 3. LAW FIRMS / LEGAL
    {
        businessType: 'law',
        variants: [
            `Hello👋🏽, My name is Calvin from Weblery, I came across {name} on Google.\n\nI work with law firms to create websites that clearly present your services and areas of expertise, helping potential clients understand what you do before reaching out.\n\nWould having one be useful for {name}?`,
        ],
        usVariants: [
            `Hi 👋 — my name is Calvin from Weblery. I came across {name} on Google.\n\nI help law firms and attorneys build professional websites that present your practice areas clearly and make it easy for prospective clients to get in touch.\n\nWould that be useful for {name}?`,
        ],
    },
    // 4. SCHOOLS / TRAINING CENTERS
    {
        businessType: 'school',
        variants: [
            `Hello👋🏽, My name is Calvin from Weblery, I came across {name} on Google.\n\nI work with schools and training centers to create websites that clearly present your programs and offerings, making it easier for prospective students and parents to understand and reach out.\n\nWould having one be useful for {name}?`,
        ],
        usVariants: [
            `Hi 👋 — my name is Calvin from Weblery. I came across {name} on Google.\n\nI help schools and training programs build websites that clearly showcase your courses and make enrollment straightforward for prospective students.\n\nWould that be a good fit for {name}?`,
        ],
    },
    // 5. REAL ESTATE AGENTS
    {
        businessType: 'realtor',
        variants: [
            `Hello👋🏽, My name is Calvin from Weblery, I came across {name} on Google.\n\nI work with real estate agents to create websites that showcase your listings and services, making it easier for potential buyers and renters to find you and get in touch.\n\nWould having one be useful for {name}?`,
        ],
        usVariants: [
            `Hi 👋 — my name is Calvin from Weblery. I came across {name} on Google.\n\nI help real estate agents and brokerages build websites that showcase listings and make it easy for buyers and sellers to reach you directly.\n\nWould that be valuable for {name}?`,
        ],
    },
    // 6. RESTAURANTS
    {
        businessType: 'restaurant',
        variants: [
            `Hello👋🏽, My name is Calvin from Weblery, I came across {name} on Google.\n\nI work with restaurants to create websites that show your menu and offerings clearly, helping diners find you and make reservations or inquiries easily.\n\nWould having one be useful for {name}?`,
        ],
        usVariants: [
            `Hi 👋 — my name is Calvin from Weblery. I came across {name} on Google.\n\nI help restaurants build simple websites that display your menu, hours, and contact info — making it easier for diners to find you and place orders or reservations.\n\nWould that be a good fit for {name}?`,
        ],
    },
    {
        businessType: 'restaurant_evening',
        variants: [
            `Hello👋🏽, My name is Calvin from Weblery, I came across {name} on Google.\n\nI work with restaurants to create websites that show your menu and offerings clearly, helping diners find you and make reservations or inquiries easily.\n\nWould having one be useful for {name}?`,
        ],
        usVariants: [
            `Hi 👋 — my name is Calvin from Weblery. I came across {name} on Google.\n\nI help restaurants build simple websites that display your menu, hours, and contact info — making it easier for diners to find you and make reservations.\n\nWould that be helpful for {name}?`,
        ],
    },
    // 7. BARS / LOUNGES
    {
        businessType: 'bar',
        variants: [
            `Hello👋🏽, My name is Calvin from Weblery, I came across {name} on Google.\n\nI work with bars and lounges to create websites that showcase your offerings and events, making it easier for patrons to find you and reach out.\n\nWould having one be useful for {name}?`,
        ],
        usVariants: [
            `Hi 👋 — my name is Calvin from Weblery. I came across {name} on Google.\n\nI help bars and lounges build websites that highlight your menu, events, and vibe — making it easier for customers to find you and plan a visit.\n\nWould that be a good fit for {name}?`,
        ],
    },
    // 8. SALONS & BARBERSHOPS
    {
        businessType: 'salon',
        variants: [
            `Hello👋🏽, My name is Calvin from Weblery, I came across {name} on Google.\n\nI work with salons and barbershops to create websites that clearly show your services and pricing, helping clients find you and book appointments online.\n\nWould having one be useful for {name}?`,
        ],
        usVariants: [
            `Hi 👋 — my name is Calvin from Weblery. I came across {name} on Google.\n\nI help salons and barbershops build websites that display your services, pricing, and availability — making it easy for clients to book appointments online.\n\nWould that be helpful for {name}?`,
        ],
    },
    // 9. GYMS & FITNESS
    {
        businessType: 'gym',
        variants: [
            `Hello👋🏽, My name is Calvin from Weblery, I came across {name} on Google.\n\nI work with gyms and fitness centers to create websites that present your programs and classes clearly, making it easier for members and prospects to find you and reach out.\n\nWould having one be useful for {name}?`,
        ],
        usVariants: [
            `Hi 👋 — my name is Calvin from Weblery. I came across {name} on Google.\n\nI help gyms and fitness studios build websites that showcase your programs, pricing, and class schedules — making it easy for prospects to sign up or get in touch.\n\nWould that be a good fit for {name}?`,
        ],
    },
    // 10. PHARMACIES
    {
        businessType: 'pharmacy',
        variants: [
            `Hello👋🏽, My name is Calvin from Weblery, I came across {name} on Google.\n\nI work with pharmacies to create websites that clearly present your products and services, making it easier for customers to find you and contact you directly.\n\nWould having one be useful for {name}?`,
        ],
        usVariants: [
            `Hi 👋 — my name is Calvin from Weblery. I came across {name} on Google.\n\nI help independent pharmacies build websites that present your services clearly and make it easy for customers to contact you, check hours, or request refills.\n\nWould that be useful for {name}?`,
        ],
    },
    // 11. COURIER / DELIVERY
    {
        businessType: 'courier',
        variants: [
            `Hello👋🏽, My name is Calvin from Weblery, I came across {name} on Google.\n\nI work with delivery services to create websites that clearly show your offerings and coverage, making it easier for clients to find you and place requests.\n\nWould having one be useful for {name}?`,
        ],
        usVariants: [
            `Hi 👋 — my name is Calvin from Weblery. I came across {name} on Google.\n\nI help courier and delivery services build websites that clearly explain your coverage area and pricing, making it easy for clients to get a quote or book a pickup.\n\nWould that be a good fit for {name}?`,
        ],
    },
    // 12. CAR REPAIR / MECHANICS
    {
        businessType: 'mechanic',
        variants: [
            `Hello👋🏽, My name is Calvin from Weblery, I came across {name} on Google.\n\nI work with garages and mechanics to create websites that showcase your services and pricing, making it easier for customers to find you and book appointments or inquiries.\n\nWould having one be useful for {name}?`,
        ],
        usVariants: [
            `Hi 👋 — my name is Calvin from Weblery. I came across {name} on Google.\n\nI help auto shops build websites that list your services, pricing, and hours — making it easy for customers to find you and schedule an appointment.\n\nWould that be helpful for {name}?`,
        ],
    },
    // 13. HOTELS / LODGES
    {
        businessType: 'hotel',
        variants: [
            `Hello👋🏽, My name is Calvin from Weblery, I came across {name} on Google.\n\nI work with hotels, lodges, and guesthouses to create websites that clearly show your rooms, services, and availability, helping travelers find you and book directly.\n\nWould having one be useful for {name}?`,
        ],
        usVariants: [
            `Hi 👋 — my name is Calvin from Weblery. I came across {name} on Google.\n\nI help hotels and inns build websites that showcase your rooms and amenities, and allow guests to book directly — reducing reliance on third-party platforms.\n\nWould that be valuable for {name}?`,
        ],
    },
    // 14. E-COMMERCE / SHOPS
    {
        businessType: 'ecommerce',
        variants: [
            `Hello👋🏽, My name is Calvin from Weblery, I came across {name} on Google.\n\nI work with shops to create websites that showcase your products and services clearly, making it easier for customers to find you and make purchases or inquiries.\n\nWould having one be useful for {name}?`,
        ],
        usVariants: [
            `Hi 👋 — my name is Calvin from Weblery. I came across {name} on Google.\n\nI help retail shops build websites that showcase your products and make it easy for customers to browse, contact you, or place orders online.\n\nWould that be a good fit for {name}?`,
        ],
    },
    // 15. CHIROPRACTOR (US-specific)
    {
        businessType: 'chiropractor',
        variants: [],
        usVariants: [
            `Hi 👋 — my name is Calvin from Weblery. I came across {name} on Google.\n\nI help chiropractic practices build professional websites that explain your approach clearly and make it easy for new patients to book a consultation.\n\nWould that be helpful for {name}?`,
        ],
    },
    // 16. INSURANCE AGENCY (US-specific)
    {
        businessType: 'insurance',
        variants: [],
        usVariants: [
            `Hi 👋 — my name is Calvin from Weblery. I came across {name} on Google.\n\nI help independent insurance agencies build websites that clearly present your coverage options and make it easy for potential clients to get a quote or reach you.\n\nWould that be a good fit for {name}?`,
        ],
    },
    // 17. COFFEE SHOP (US-specific)
    {
        businessType: 'coffee',
        variants: [],
        usVariants: [
            `Hi 👋 — my name is Calvin from Weblery. I came across {name} on Google.\n\nI help independent coffee shops build simple websites that show your menu, hours, and location — making it easier for customers to find and follow you.\n\nWould that be useful for {name}?`,
        ],
    },
    // 18. ROOFER
    {
        businessType: 'roofer',
        variants: [],
        usVariants: [
            `Hi 👋 — my name is Calvin from Weblery. I came across {name} on Google.\n\nI help roofing contractors build clean, professional gallery websites that showcase your local installs and help you win more high-ticket roofing jobs.\n\nWould that be valuable for {name}?`,
        ],
    },
    // 19. PLUMBER
    {
        businessType: 'plumber',
        variants: [],
        usVariants: [
            `Hi 👋 — my name is Calvin from Weblery. I came across {name} on Google.\n\nI help plumbing services build professional websites that showcase your licensing and make it simple for local homeowners to request emergency service online.\n\nWould that be useful for {name}?`,
        ],
    },
    // 20. ELECTRICIAN
    {
        businessType: 'electrician',
        variants: [],
        usVariants: [
            `Hi 👋 — my name is Calvin from Weblery. I found {name} on Google.\n\nI help electricians and electrical contractors build clean websites that present your services and safety certifications, making it easy for new clients to trust and book you.\n\nWould that be a good fit for {name}?`,
        ],
    },
    // 21. HVAC CONTRACTOR
    {
        businessType: 'hvac',
        variants: [],
        usVariants: [
            `Hi 👋 — my name is Calvin from Weblery. I found {name} on Google.\n\nI help local HVAC contractors build professional websites that outline your services and make scheduling diagnostic visits easy for homeowners.\n\nWould that be helpful for {name}?`,
        ],
    },
    // 22. LANDSCAPER
    {
        businessType: 'landscaper',
        variants: [],
        usVariants: [
            `Hi 👋 — my name is Calvin from Weblery. I came across {name} on Google.\n\nI help landscapers and lawn care businesses build websites that showcase your outdoor project galleries and make it simple to request lawn care quotes.\n\nWould that be valuable for {name}?`,
        ],
    },
    // 23. HOUSE PAINTER
    {
        businessType: 'painter',
        variants: [],
        usVariants: [
            `Hi 👋 — my name is Calvin from Weblery. I found {name} on Google.\n\nI help painting contractors build professional websites that display your before-and-after projects and color consulting, making it easy to schedule estimates.\n\nWould that be a good fit for {name}?`,
        ],
    },
    // 24. AUTO DETAILER
    {
        businessType: 'detailing',
        variants: [],
        usVariants: [
            `Hi 👋 — my name is Calvin from Weblery. I found {name} on Google.\n\nI help auto detailers build clean websites with service package grids, making it simple for car owners to view detailing options and request a booking.\n\nWould that be useful for {name}?`,
        ],
    },
    // 25. MOVER
    {
        businessType: 'movers',
        variants: [],
        usVariants: [
            `Hi 👋 — my name is Calvin from Weblery. I came across {name} on Google.\n\nI help local moving companies build websites with simple quote request forms, making it easy for relocating families to book your services.\n\nWould that be a good fit for {name}?`,
        ],
    },
    // 26. GENERAL CONTRACTOR
    {
        businessType: 'general_contractor',
        variants: [],
        usVariants: [
            `Hi 👋 — my name is Calvin from Weblery. I found {name} on Google.\n\nI help general contractors build high-end websites that showcase your custom builds and renovations, building the trust needed to land premium contracts.\n\nWould that be helpful for {name}?`,
        ],
    },
    // 27. TREE SERVICE
    {
        businessType: 'tree_service',
        variants: [],
        usVariants: [
            `Hi 👋 — my name is Calvin from Weblery. I came across {name} on Google.\n\nI help tree service companies build websites that highlight your safety standards, machinery, and licensing, making tree removal quotes straightforward.\n\nWould that be valuable for {name}?`,
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
 * Get a message for a business type and market.
 * Rotates between variants based on current day.
 */
export function getMessage(businessName: string, businessType: string, market: Market = 'UG'): string {
    const formattedName = formatBusinessName(businessName);
    const template = MESSAGE_TEMPLATES.find(t => t.businessType === businessType);

    if (!template) {
        // Fallback generic message — market-aware
        if (market === 'US') {
            return `Hi 👋 — my name is Calvin from Weblery. I came across ${formattedName} on Google.\n\nI help small businesses build professional websites that make it easy for customers to find and contact you.\n\nWould that be a good fit for ${formattedName}?`;
        }
        return `Hello👋🏽, I found ${formattedName} on Google Maps.\n\nI noticed there's no direct WhatsApp contact page for customers.\n\nI help businesses make it easy for people to reach them.\n\nWould you be open to seeing how this would help ${formattedName}?\n\n- Calvin, Weblery`;
    }

    // Choose correct variants based on market
    const variants = market === 'US'
        ? (template.usVariants && template.usVariants.length > 0 ? template.usVariants : template.variants)
        : template.variants;

    if (!variants || variants.length === 0) {
        // No variants defined for this market — use fallback
        return getMessage(businessName, '__fallback__', market);
    }

    // Rotate based on day of year
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24));
    const variantIndex = dayOfYear % variants.length;
    const message = variants[variantIndex];

    return message.replace(/{name}/g, formattedName);
}
