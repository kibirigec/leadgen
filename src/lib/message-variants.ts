/**
 * Message Variants
 * 
 * Business-type specific message templates with rotation
 * Safety: No links in first message, professional tone
 */

export interface MessageTemplate {
    businessType: string;
    variants: string[];
}

/**
 * Message templates per business type
 * {name} = Business name
 * {location} = City/area
 */
export const MESSAGE_TEMPLATES: MessageTemplate[] = [
    // CLINICS / MEDICAL
    {
        businessType: "clinic",
        variants: [
            "Hi {name}, I noticed you serve patients in {location}. A lot of clinics are missing online inquiries after hours. Would you be open to a quick chat about capturing those?",
            "Hello {name}. Patients often search for clinics late at night but can't reach anyone. I help clinics like yours capture those leads. Interested?",
            "Hi there! I work with clinics in {location} to help them get more patient inquiries. Would you like to hear how?",
        ],
    },
    {
        businessType: "clinic_evening",
        variants: [
            "Hi {name}, do you ever miss patient calls after your clinic closes? Many clinics in {location} face this. I can help.",
            "Hello! Patients searching for clinics at night often can't book. I help clinics capture these. Would you be interested?",
        ],
    },

    // DENTAL
    {
        businessType: "dental",
        variants: [
            "Hi {name}, dental patients often research at night before booking. I help dental clinics in {location} capture those inquiries. Interested?",
            "Hello! Many people search for dentists after hours. If you're missing those leads, I can help. Quick chat?",
        ],
    },

    // LAW FIRMS
    {
        businessType: "law",
        variants: [
            "Hi {name}, potential clients often need legal help urgently but call after hours. I help law firms capture those leads. Would you be open to a brief discussion?",
            "Hello! Legal inquiries often come at inconvenient times. I work with advocates in {location} to capture more clients. Interested?",
        ],
    },

    // RESTAURANTS / FOOD
    {
        businessType: "restaurant",
        variants: [
            "Hi {name}! Many customers in {location} search for places to eat but can't easily order or reserve. I help restaurants like yours get more business. Interested?",
            "Hello! I noticed {name} doesn't have an online ordering system. I can help you capture more orders. Quick chat?",
        ],
    },
    {
        businessType: "restaurant_evening",
        variants: [
            "Hi {name}, customers often want to order late at night but can't. I help restaurants capture those late orders. Would you like to hear more?",
            "Hello! People in {location} search for food delivery after many restaurants close their phones. I can help you get those orders.",
        ],
    },

    // SALONS / BARBERSHOPS
    {
        businessType: "salon",
        variants: [
            "Hi {name}! I help salons in {location} get more bookings from customers who prefer booking online. Would you be interested?",
            "Hello! Many people want to book salon appointments online but can't. I can help {name} capture more clients. Quick chat?",
        ],
    },

    // BARS / LOUNGES
    {
        businessType: "bar",
        variants: [
            "Hi {name}! I help bars and lounges in {location} get more reservations and event bookings. Would you like to hear how?",
            "Hello! People often want to reserve tables or book venues but can't find online options. I help bars like yours. Interested?",
        ],
    },

    // MECHANICS / AUTO REPAIR
    {
        businessType: "mechanic",
        variants: [
            "Hi {name}! Car owners often need emergency repairs but struggle to find open garages. I help mechanics in {location} get more customers. Interested?",
            "Hello! Many drivers in {location} search for mechanics online. If you're not showing up, you're missing business. I can help.",
        ],
    },

    // HOTELS / LODGES
    {
        businessType: "hotel",
        variants: [
            "Hi {name}! Travelers often search for accommodation in {location} but can't easily book without big platforms. I help hotels get direct bookings. Interested?",
            "Hello! Many guests prefer booking directly with hotels. I help properties in {location} capture those bookings. Quick chat?",
        ],
    },

    // GYMS / FITNESS
    {
        businessType: "gym",
        variants: [
            "Hi {name}! People looking to join gyms in {location} often can't find pricing or sign up online. I help fitness centers get more members. Interested?",
            "Hello! Many gym seekers want to research before visiting. I help gyms in {location} capture those leads. Would you like to hear more?",
        ],
    },

    // PHARMACIES
    {
        businessType: "pharmacy",
        variants: [
            "Hi {name}! Customers often need to check medicine availability before visiting. I help pharmacies in {location} serve customers better. Interested?",
            "Hello! Many people search for pharmacies late at night. I help chemists capture those inquiries. Quick chat?",
        ],
    },

    // REAL ESTATE
    {
        businessType: "realtor",
        variants: [
            "Hi {name}! Property seekers often research at night but can't reach agents. I help realtors in {location} capture more leads. Interested?",
            "Hello! Many people looking for property want instant responses. I help real estate agents capture those inquiries. Would you like to hear more?",
        ],
    },
    {
        businessType: "realtor_evening",
        variants: [
            "Hi {name}, most property searches happen in the evening. I help agents like you capture leads when you're offline. Interested?",
        ],
    },

    // SCHOOLS / TRAINING
    {
        businessType: "school",
        variants: [
            "Hi {name}! Parents often research schools online before inquiring. I help educational institutions in {location} capture those interested families. Would you like to hear more?",
            "Hello! Many parents want to learn about schools online. I help institutions convert website visitors into enrollments. Interested?",
        ],
    },

    // COURIER / DELIVERY
    {
        businessType: "courier",
        variants: [
            "Hi {name}! Businesses often need urgent deliveries but can't easily book couriers. I help delivery services in {location} get more orders. Interested?",
        ],
    },
];

/**
 * Get a message for a business type (rotates variants)
 */
export function getMessage(
    businessType: string,
    businessName: string,
    location: string
): string {
    const template = MESSAGE_TEMPLATES.find(t => t.businessType === businessType);

    if (!template) {
        // Fallback generic message
        return `Hi ${businessName}! I help businesses in ${location} get more customers online. Would you be interested in a quick chat?`;
    }

    // Simple rotation based on current minute
    const variantIndex = new Date().getMinutes() % template.variants.length;
    const message = template.variants[variantIndex];

    return message
        .replace(/{name}/g, businessName)
        .replace(/{location}/g, location);
}

/**
 * Get message with specific variant index (for testing)
 */
export function getMessageVariant(
    businessType: string,
    variantIndex: number,
    businessName: string,
    location: string
): string {
    const template = MESSAGE_TEMPLATES.find(t => t.businessType === businessType);

    if (!template) {
        return `Hi ${businessName}! I help businesses in ${location} get more customers online. Would you be interested in a quick chat?`;
    }

    const safeIndex = variantIndex % template.variants.length;
    const message = template.variants[safeIndex];

    return message
        .replace(/{name}/g, businessName)
        .replace(/{location}/g, location);
}
