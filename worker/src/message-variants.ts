/**
 * Message Variants for Worker
 * 
 * Business-type specific message templates with rotation
 */

export interface MessageTemplate {
    businessType: string;
    variants: string[];
}

export const MESSAGE_TEMPLATES: MessageTemplate[] = [
    // CLINICS
    {
        businessType: 'clinic',
        variants: [
            'Hi {name}, I noticed you serve patients in {location}. A lot of clinics are missing online inquiries after hours. Would you be open to a quick chat about capturing those?',
            'Hello {name}. Patients often search for clinics late at night but can\'t reach anyone. I help clinics like yours capture those leads. Interested?',
        ],
    },
    // DENTAL
    {
        businessType: 'dental',
        variants: [
            'Hi {name}, dental patients often research at night before booking. I help dental clinics in {location} capture those inquiries. Interested?',
            'Hello! Many people search for dentists after hours. If you\'re missing those leads, I can help. Quick chat?',
        ],
    },
    // LAW
    {
        businessType: 'law',
        variants: [
            'Hi {name}, potential clients often need legal help urgently but call after hours. I help law firms capture those leads. Would you be open to a brief discussion?',
            'Hello! Legal inquiries often come at inconvenient times. I work with advocates in {location} to capture more clients. Interested?',
        ],
    },
    // RESTAURANT
    {
        businessType: 'restaurant',
        variants: [
            'Hi {name}! Many customers in {location} search for places to eat but can\'t easily order or reserve. I help restaurants like yours get more business. Interested?',
            'Hello! I noticed {name} doesn\'t have an online ordering system. I can help you capture more orders. Quick chat?',
        ],
    },
    // SALON
    {
        businessType: 'salon',
        variants: [
            'Hi {name}! I help salons in {location} get more bookings from customers who prefer booking online. Would you be interested?',
            'Hello! Many people want to book salon appointments online but can\'t. I can help {name} capture more clients. Quick chat?',
        ],
    },
    // BAR
    {
        businessType: 'bar',
        variants: [
            'Hi {name}! I help bars and lounges in {location} get more reservations and event bookings. Would you like to hear how?',
            'Hello! People often want to reserve tables or book venues but can\'t find online options. I help bars like yours. Interested?',
        ],
    },
    // MECHANIC
    {
        businessType: 'mechanic',
        variants: [
            'Hi {name}! Car owners often need emergency repairs but struggle to find open garages. I help mechanics in {location} get more customers. Interested?',
            'Hello! Many drivers in {location} search for mechanics online. If you\'re not showing up, you\'re missing business. I can help.',
        ],
    },
    // HOTEL
    {
        businessType: 'hotel',
        variants: [
            'Hi {name}! Travelers often search for accommodation in {location} but can\'t easily book without big platforms. I help hotels get direct bookings. Interested?',
            'Hello! Many guests prefer booking directly with hotels. I help properties in {location} capture those bookings. Quick chat?',
        ],
    },
    // GYM
    {
        businessType: 'gym',
        variants: [
            'Hi {name}! People looking to join gyms in {location} often can\'t find pricing or sign up online. I help fitness centers get more members. Interested?',
        ],
    },
    // PHARMACY
    {
        businessType: 'pharmacy',
        variants: [
            'Hi {name}! Customers often need to check medicine availability before visiting. I help pharmacies in {location} serve customers better. Interested?',
        ],
    },
    // REALTOR
    {
        businessType: 'realtor',
        variants: [
            'Hi {name}! Property seekers often research at night but can\'t reach agents. I help realtors in {location} capture more leads. Interested?',
        ],
    },
    // SCHOOL
    {
        businessType: 'school',
        variants: [
            'Hi {name}! Parents often research schools online before inquiring. I help educational institutions in {location} capture those interested families. Would you like to hear more?',
        ],
    },
    // COURIER
    {
        businessType: 'courier',
        variants: [
            'Hi {name}! Businesses often need urgent deliveries but can\'t easily book couriers. I help delivery services in {location} get more orders. Interested?',
        ],
    },
];

/**
 * Get a message for a business type (rotates variants)
 */
export function getMessage(
    businessName: string,
    businessType: string,
    location: string = 'your area'
): string {
    const template = MESSAGE_TEMPLATES.find(t => t.businessType === businessType);

    if (!template) {
        // Fallback generic message
        return `Hi ${businessName}! I help businesses in ${location} get more customers online. Would you be interested in a quick chat?`;
    }

    // Rotate based on current minute
    const variantIndex = new Date().getMinutes() % template.variants.length;
    const message = template.variants[variantIndex];

    return message
        .replace(/{name}/g, businessName)
        .replace(/{location}/g, location);
}
