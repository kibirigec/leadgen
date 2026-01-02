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
            `Hello, I came across {name} on Google Maps. I noticed patients don't have a simple contact page to WhatsApp you directly.\n\nI help clinics set up a small contact page so inquiries don't get missed.\n\nCan I show you a quick example?\n\n- Calvin`,
            `Hello, I found {name} on Google Maps. I noticed there's no direct WhatsApp contact page for patients.\n\nI help clinics make it easy for people to reach them.\n\nWould you be open to seeing a short demo?\n\n- Calvin`,
        ],
    },
    // 2. DENTAL CLINICS
    {
        businessType: 'dental',
        variants: [
            `Hello, I came across {name} on Google Maps. I noticed patients don't have a simple contact page to WhatsApp you directly.\n\nI help dental practices set this up so inquiries don't get missed.\n\nCan I show you a quick example?\n\n- Calvin`,
            `Hello, I found {name} on Google Maps. I noticed there's no direct WhatsApp contact page for patients.\n\nI help dental clinics make it easy for people to reach them.\n\nWould you be open to seeing a short demo?\n\n- Calvin`,
        ],
    },
    // 3. LAW FIRMS / LEGAL
    {
        businessType: 'law',
        variants: [
            `Hello, I came across {name} on Google Maps. I noticed potential clients don't have a simple contact page to WhatsApp you directly.\n\nI help law firms set this up so inquiries don't get missed.\n\nCan I show you a quick example?\n\n- Calvin`,
            `Hello, I found {name} on Google Maps. I noticed there's no direct WhatsApp contact page for clients.\n\nI help legal practices make it easy for people to reach them.\n\nWould you be open to seeing a short demo?\n\n- Calvin`,
        ],
    },
    // 4. SCHOOLS / TRAINING CENTERS
    {
        businessType: 'school',
        variants: [
            `Hello, I came across {name} on Google Maps. I noticed prospective students don't have a simple contact page to WhatsApp you directly.\n\nI help schools set this up so inquiries don't get missed.\n\nCan I show you a quick example?\n\n- Calvin`,
            `Hello, I found {name} on Google Maps. I noticed there's no direct WhatsApp contact page for students.\n\nI help training centers make it easy for people to reach them.\n\nWould you be open to seeing a short demo?\n\n- Calvin`,
        ],
    },
    // 5. REAL ESTATE AGENTS
    {
        businessType: 'realtor',
        variants: [
            `Hello, I came across {name} on Google Maps. I noticed buyers don't have a simple contact page to WhatsApp you directly.\n\nI help agents set this up so inquiries don't get missed.\n\nCan I show you a quick example?\n\n- Calvin`,
            `Hello, I found {name} on Google Maps. I noticed there's no direct WhatsApp contact page for clients.\n\nI help real estate agents make it easy for people to reach them.\n\nWould you be open to seeing a short demo?\n\n- Calvin`,
        ],
    },
    // 6. RESTAURANTS
    {
        businessType: 'restaurant',
        variants: [
            `Hello, I came across {name} on Google Maps. I noticed customers don't have a simple contact page to WhatsApp you directly.\n\nI help restaurants set this up so inquiries don't get missed.\n\nCan I show you a quick example?\n\n- Calvin`,
            `Hello, I found {name} on Google Maps. I noticed there's no direct WhatsApp contact page for customers.\n\nI help restaurants make it easy for people to reach them.\n\nWould you be open to seeing a short demo?\n\n- Calvin`,
        ],
    },
    {
        businessType: 'restaurant_evening',
        variants: [
            `Hello, I came across {name} on Google Maps. I noticed customers don't have a simple contact page to WhatsApp you directly.\n\nI help restaurants set this up so inquiries don't get missed.\n\nCan I show you a quick example?\n\n- Calvin`,
            `Hello, I found {name} on Google Maps. I noticed there's no direct WhatsApp contact page for customers.\n\nI help restaurants make it easy for people to reach them.\n\nWould you be open to seeing a short demo?\n\n- Calvin`,
        ],
    },
    // 7. BARS / LOUNGES
    {
        businessType: 'bar',
        variants: [
            `Hello, I came across {name} on Google Maps. I noticed customers don't have a simple contact page to WhatsApp you directly.\n\nI help bars set this up so inquiries don't get missed.\n\nCan I show you a quick example?\n\n- Calvin`,
            `Hello, I found {name} on Google Maps. I noticed there's no direct WhatsApp contact page for patrons.\n\nI help lounges make it easy for people to reach them.\n\nWould you be open to seeing a short demo?\n\n- Calvin`,
        ],
    },
    // 8. SALONS & BARBERSHOPS
    {
        businessType: 'salon',
        variants: [
            `Hello, I came across {name} on Google Maps. I noticed clients don't have a simple contact page to WhatsApp you directly.\n\nI help salons set this up so inquiries don't get missed.\n\nCan I show you a quick example?\n\n- Calvin`,
            `Hello, I found {name} on Google Maps. I noticed there's no direct WhatsApp contact page for customers.\n\nI help barbershops make it easy for people to reach them.\n\nWould you be open to seeing a short demo?\n\n- Calvin`,
        ],
    },
    // 9. GYMS & FITNESS
    {
        businessType: 'gym',
        variants: [
            `Hello, I came across {name} on Google Maps. I noticed people don't have a simple contact page to WhatsApp you directly.\n\nI help gyms set this up so inquiries don't get missed.\n\nCan I show you a quick example?\n\n- Calvin`,
            `Hello, I found {name} on Google Maps. I noticed there's no direct WhatsApp contact page for prospects.\n\nI help fitness centers make it easy for people to reach them.\n\nWould you be open to seeing a short demo?\n\n- Calvin`,
        ],
    },
    // 10. PHARMACIES
    {
        businessType: 'pharmacy',
        variants: [
            `Hello, I came across {name} on Google Maps. I noticed customers don't have a simple contact page to WhatsApp you directly.\n\nI help pharmacies set this up so inquiries don't get missed.\n\nCan I show you a quick example?\n\n- Calvin`,
            `Hello, I found {name} on Google Maps. I noticed there's no direct WhatsApp contact page for customers.\n\nI help pharmacies make it easy for people to reach them.\n\nWould you be open to seeing a short demo?\n\n- Calvin`,
        ],
    },
    // 11. COURIER / DELIVERY
    {
        businessType: 'courier',
        variants: [
            `Hello, I came across {name} on Google Maps. I noticed customers don't have a simple contact page to WhatsApp you directly.\n\nI help delivery businesses set this up so inquiries don't get missed.\n\nCan I show you a quick example?\n\n- Calvin`,
            `Hello, I found {name} on Google Maps. I noticed there's no direct WhatsApp contact page for clients.\n\nI help courier services make it easy for people to reach them.\n\nWould you be open to seeing a short demo?\n\n- Calvin`,
        ],
    },
    // 12. CAR REPAIR / MECHANICS
    {
        businessType: 'mechanic',
        variants: [
            `Hello, I came across {name} on Google Maps. I noticed customers don't have a simple contact page to WhatsApp you directly.\n\nI help garages set this up so inquiries don't get missed.\n\nCan I show you a quick example?\n\n- Calvin`,
            `Hello, I found {name} on Google Maps. I noticed there's no direct WhatsApp contact page for repairs.\n\nI help mechanics make it easy for people to reach them.\n\nWould you be open to seeing a short demo?\n\n- Calvin`,
        ],
    },
    // 13. HOTELS / LODGES
    {
        businessType: 'hotel',
        variants: [
            `Hello, I came across {name} on Google Maps. I noticed guests don't have a simple contact page to WhatsApp you directly.\n\nI help lodges set this up so inquiries don't get missed.\n\nCan I show you a quick example?\n\n- Calvin`,
            `Hello, I found {name} on Google Maps. I noticed there's no direct WhatsApp contact page for guests.\n\nI help hotels make it easy for people to reach them.\n\nWould you be open to seeing a short demo?\n\n- Calvin`,
        ],
    },
    // 14. E-COMMERCE / SHOPS
    {
        businessType: 'ecommerce',
        variants: [
            `Hello, I came across {name} on Google Maps. I noticed customers don't have a simple contact page to WhatsApp you directly.\n\nI help shops set this up so inquiries don't get missed.\n\nCan I show you a quick example?\n\n- Calvin`,
            `Hello, I found {name} on Google Maps. I noticed there's no direct WhatsApp contact page for buyers.\n\nI help shops make it easy for people to reach them.\n\nWould you be open to seeing a short demo?\n\n- Calvin`,
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
        return `Hello, I came across ${formattedName} on Google Maps. I help businesses set up automatic replies so customers can reach them at any time.\n\nWould you be open to a quick 1-minute demo?\n\n- Calvin`;
    }

    // Rotate based on day of year
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24));
    const variantIndex = dayOfYear % template.variants.length;
    const message = template.variants[variantIndex];

    return message.replace(/{name}/g, formattedName);
}
