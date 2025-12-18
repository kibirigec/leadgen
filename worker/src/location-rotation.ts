/**
 * Location Rotation Map for Uganda
 * 
 * Suburb-level granularity for Google Maps scraping
 * Reduces duplicates and prevents exhaustion
 */

export const LOCATION_ROTATION: Record<string, string[]> = {
    Kampala: [
        "Kololo, Kampala, Uganda",
        "Nakasero, Kampala, Uganda",
        "Naguru, Kampala, Uganda",
        "Ntinda, Kampala, Uganda",
        "Bugolobi, Kampala, Uganda",
        "Muyenga, Kampala, Uganda",
        "Munyonyo, Kampala, Uganda",
        "Buziga, Kampala, Uganda",
        "Lubowa, Kampala, Uganda",
        "Kira, Wakiso, Uganda",
        "Kisaasi, Kampala, Uganda",
        "Kyanja, Kampala, Uganda",
        "Makindye, Kampala, Uganda",
        "Bukoto, Kampala, Uganda",
        "Kabalagala, Kampala, Uganda",
        "Kyambogo, Kampala, Uganda",
        "Bweyogerere, Wakiso, Uganda",
        "Kawempe, Kampala, Uganda",
        "Rubaga, Kampala, Uganda"
    ],

    Entebbe: [
        "Entebbe Town, Uganda",
        "Garuga, Entebbe, Uganda",
        "Katabi, Entebbe, Uganda",
        "Kitooro, Entebbe, Uganda"
    ],

    Jinja: [
        "Jinja City, Uganda",
        "Kakindu, Jinja, Uganda",
        "Makoma, Jinja, Uganda",
        "Masese, Jinja, Uganda",
        "Bugembe, Jinja, Uganda"
    ],

    Mukono: [
        "Mukono Town, Uganda",
        "Seeta, Mukono, Uganda",
        "Nama, Mukono, Uganda"
    ],

    Mbarara: [
        "Mbarara City, Uganda",
        "Kakoba, Mbarara, Uganda",
        "Nyamityobora, Mbarara, Uganda",
        "Biharwe, Mbarara, Uganda"
    ],

    Masaka: [
        "Masaka City, Uganda",
        "Nyendo, Masaka, Uganda",
        "Kijjabwemi, Masaka, Uganda"
    ],

    Gulu: [
        "Gulu City, Uganda",
        "Pece, Gulu, Uganda",
        "Laroo, Gulu, Uganda",
        "Bardege, Gulu, Uganda"
    ],

    Lira: [
        "Lira City, Uganda",
        "Adyel, Lira, Uganda",
        "Barracks, Lira, Uganda"
    ],

    Mbale: [
        "Mbale City, Uganda",
        "Namakwekwe, Mbale, Uganda",
        "Kamukuywa, Mbale, Uganda",
        "Industrial Area, Mbale, Uganda"
    ],

    Soroti: [
        "Soroti City, Uganda",
        "Lira Road, Soroti, Uganda",
        "Arapai Road, Soroti, Uganda"
    ],

    FortPortal: [
        "Fort Portal City, Uganda",
        "Kisenyi, Fort Portal, Uganda",
        "Bukwali, Fort Portal, Uganda"
    ],

    Kasese: [
        "Kasese Town, Uganda",
        "Mpondwe Road, Kasese, Uganda",
        "Nyamwamba, Kasese, Uganda"
    ],

    Hoima: [
        "Hoima City, Uganda",
        "Kiganda, Hoima, Uganda",
        "Kiryatete, Hoima, Uganda"
    ],

    Arua: [
        "Arua City, Uganda",
        "Ediofe, Arua, Uganda",
        "Pajulu Road, Arua, Uganda"
    ],

    Iganga: [
        "Iganga Town, Uganda",
        "Nakavule, Iganga, Uganda"
    ],

    Bushenyi: [
        "Bushenyi Town, Uganda",
        "Ishaka, Bushenyi, Uganda"
    ]
};

// All cities in rotation order
export const CITIES = Object.keys(LOCATION_ROTATION);

// Total suburbs available
export const TOTAL_SUBURBS = Object.values(LOCATION_ROTATION).reduce((acc, suburbs) => acc + suburbs.length, 0);

/**
 * Get today's city based on day of week
 * Cycles through cities weekly
 */
export function getTodaysCity(): string {
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24));
    const cityIndex = dayOfYear % CITIES.length;
    return CITIES[cityIndex];
}

/**
 * Get all suburbs for a city
 */
export function getSuburbsForCity(city: string): string[] {
    return LOCATION_ROTATION[city] || [];
}
