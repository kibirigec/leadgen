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
            `Hello to you👋🏽, My name is Calvin from Weblery, I came across {name} on Google.\n\nI work with PR firms to build their websites that clearly present your services and past work, so potential clients can find you easily and understand what you do before reaching out.\n\nWould having one be useful for {name}?`,
        ],
    },
    // SPECIAL: CHARITY ORGANIZATIONS
    {
        businessType: 'charity',
        variants: [
            `Hello to you👋🏽, My name is Calvin from Weblery, I came across {name} and was impressed by the work you’re doing.\n\nI work with charitable organizations to build websites that clearly communicate their mission and impact, making it easier for donors and partners to understand your work and also donate directly through the website.\n\nWould having one be useful for {name}?`,
        ],
    },
    // SPECIAL: PRIVATE CLINICS (Specific Request)
    {
        businessType: 'private_clinic',
        variants: [
            `Hello to you👋🏽, My name is Calvin from Weblery, I came across {name} on Google.\n\nI work with clinics to build websites that help patients find the clinic online and know what to expect before reaching out.\n\nWould having one be useful for {name}?`,
        ],
    },
    // 1. CLINICS / MEDICAL
    {
        businessType: 'clinic',
        variants: [
            `Hello to you👋🏽, I found {name} on Google Maps.\n\nI noticed there's no direct WhatsApp contact page for patients.\n\nI help clinics make it easy for people to reach them.\n\nWould you be open to seeing how this would help {name}?\n\n- Calvin, Weblery`,
        ],
    },
    // 2. DENTAL CLINICS
    {
        businessType: 'dental',
        variants: [
            `Hello to you👋🏽, I found {name} on Google Maps.\n\nI noticed there's no direct WhatsApp contact page for patients.\n\nI help dental clinics make it easy for people to reach them.\n\nWould you be open to seeing how this would help {name}?\n\n- Calvin, Weblery`,
        ],
    },
    // 3. LAW FIRMS / LEGAL
    {
        businessType: 'law',
        variants: [
            `Hello to you👋🏽, I found {name} on Google Maps.\n\nI noticed there's no direct WhatsApp contact page for clients.\n\nI help law firms make it easy for people to reach them.\n\nWould you be open to seeing how this would help {name}?\n\n- Calvin, Weblery`,
        ],
    },
    // 4. SCHOOLS / TRAINING CENTERS
    {
        businessType: 'school',
        variants: [
            `Hello to you👋🏽, I found {name} on Google Maps.\n\nI noticed there's no direct WhatsApp contact page for students.\n\nI help schools make it easy for people to reach them.\n\nWould you be open to seeing how this would help {name}?\n\n- Calvin, Weblery`,
        ],
    },
    // 5. REAL ESTATE AGENTS
    {
        businessType: 'realtor',
        variants: [
            `Hello to you👋🏽, I found {name} on Google Maps.\n\nI noticed there's no direct WhatsApp contact page for clients.\n\nI help real estate agents make it easy for people to reach them.\n\nWould you be open to seeing how this would help {name}?\n\n- Calvin, Weblery`,
        ],
    },
    // 6. RESTAURANTS
    {
        businessType: 'restaurant',
        variants: [
            `Hello to you👋🏽, I found {name} on Google Maps.\n\nI noticed there's no direct WhatsApp contact page for customers.\n\nI help restaurants make it easy for people to reach them.\n\nWould you be open to seeing how this would help {name}?\n\n- Calvin, Weblery`,
        ],
    },
    {
        businessType: 'restaurant_evening',
        variants: [
            `Hello to you👋🏽, I found {name} on Google Maps.\n\nI noticed there's no direct WhatsApp contact page for customers.\n\nI help restaurants make it easy for people to reach them.\n\nWould you be open to seeing how this would help {name}?\n\n- Calvin, Weblery`,
        ],
    },
    // 7. BARS / LOUNGES
    {
        businessType: 'bar',
        variants: [
            `Hello to you👋🏽, I found {name} on Google Maps.\n\nI noticed there's no direct WhatsApp contact page for patrons.\n\nI help bars and lounges make it easy for people to reach them.\n\nWould you be open to seeing how this would help {name}?\n\n- Calvin, Weblery`,
        ],
    },
    // 8. SALONS & BARBERSHOPS
    {
        businessType: 'salon',
        variants: [
            `Hello to you👋🏽, I found {name} on Google Maps.\n\nI noticed there's no direct WhatsApp contact page for clients.\n\nI help salons and barbershops make it easy for people to reach them.\n\nWould you be open to seeing how this would help {name}?\n\n- Calvin, Weblery`,
        ],
    },
    // 9. GYMS & FITNESS
    {
        businessType: 'gym',
        variants: [
            `Hello to you👋🏽, I found {name} on Google Maps.\n\nI noticed there's no direct WhatsApp contact page for members.\n\nI help fitness centers make it easy for people to reach them.\n\nWould you be open to seeing how this would help {name}?\n\n- Calvin, Weblery`,
        ],
    },
    // 10. PHARMACIES
    {
        businessType: 'pharmacy',
        variants: [
            `Hello to you👋🏽, I found {name} on Google Maps.\n\nI noticed there's no direct WhatsApp contact page for customers.\n\nI help pharmacies make it easy for people to reach them.\n\nWould you be open to seeing how this would help {name}?\n\n- Calvin, Weblery`,
        ],
    },
    // 11. COURIER / DELIVERY
    {
        businessType: 'courier',
        variants: [
            `Hello to you👋🏽, I found {name} on Google Maps.\n\nI noticed there's no direct WhatsApp contact page for clients.\n\nI help delivery services make it easy for people to reach them.\n\nWould you be open to seeing how this would help {name}?\n\n- Calvin, Weblery`,
        ],
    },
    // 12. CAR REPAIR / MECHANICS
    {
        businessType: 'mechanic',
        variants: [
            `Hello to you👋🏽, I found {name} on Google Maps.\n\nI noticed there's no direct WhatsApp contact page for customers.\n\nI help garages and mechanics make it easy for people to reach them.\n\nWould you be open to seeing how this would help {name}?\n\n- Calvin, Weblery`,
        ],
    },
    // 13. HOTELS / LODGES
    {
        businessType: 'hotel',
        variants: [
            `Hello to you👋🏽, I found {name} on Google Maps.\n\nI noticed there's no direct WhatsApp contact page for guests.\n\nI help hotels and lodges make it easy for people to reach them.\n\nWould you be open to seeing how this would help {name}?\n\n- Calvin, Weblery`,
        ],
    },
    // 14. E-COMMERCE / SHOPS
    {
        businessType: 'ecommerce',
        variants: [
            `Hello to you👋🏽, I found {name} on Google Maps.\n\nI noticed there's no direct WhatsApp contact page for buyers.\n\nI help shops make it easy for people to reach them.\n\nWould you be open to seeing how this would help {name}?\n\n- Calvin, Weblery`,
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
        return `Hello to you👋🏽, I found ${formattedName} on Google Maps.\n\nI noticed there's no direct WhatsApp contact page for customers.\n\nI help businesses make it easy for people to reach them.\n\nWould you be open to seeing how this would help ${formattedName}?\n\n- Calvin, Weblery`;
    }

    // Rotate based on day of year
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24));
    const variantIndex = dayOfYear % template.variants.length;
    const message = template.variants[variantIndex];

    return message.replace(/{name}/g, formattedName);
}
