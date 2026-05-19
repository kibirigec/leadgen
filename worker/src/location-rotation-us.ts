/**
 * US Location Rotation Map
 *
 * Neighborhood-level granularity for Google Maps scraping across
 * 5 major US metro areas. Structured identically to location-rotation.ts.
 */

export const US_LOCATION_ROTATION: Record<string, string[]> = {
    NewYork: [
        'Manhattan, New York, USA',
        'Brooklyn, New York, USA',
        'Queens, New York, USA',
        'The Bronx, New York, USA',
        'Staten Island, New York, USA',
        'Flushing, Queens, New York, USA',
        'Harlem, Manhattan, New York, USA',
        'Astoria, Queens, New York, USA',
        'Williamsburg, Brooklyn, New York, USA',
        'Jersey City, New Jersey, USA',
        'Hoboken, New Jersey, USA',
        'Long Island City, Queens, New York, USA',
        'Bushwick, Brooklyn, New York, USA',
        'Park Slope, Brooklyn, New York, USA',
        'Bayside, Queens, New York, USA',
    ],

    LosAngeles: [
        'Downtown Los Angeles, California, USA',
        'Hollywood, Los Angeles, California, USA',
        'Santa Monica, California, USA',
        'Koreatown, Los Angeles, California, USA',
        'Culver City, California, USA',
        'Long Beach, California, USA',
        'Pasadena, California, USA',
        'Burbank, California, USA',
        'Glendale, California, USA',
        'West Hollywood, California, USA',
        'Silver Lake, Los Angeles, California, USA',
        'Venice Beach, Los Angeles, California, USA',
        'Inglewood, California, USA',
        'Torrance, California, USA',
        'El Monte, California, USA',
    ],

    Houston: [
        'Downtown Houston, Texas, USA',
        'Midtown Houston, Texas, USA',
        'The Heights, Houston, Texas, USA',
        'Sugar Land, Texas, USA',
        'Katy, Texas, USA',
        'Pearland, Texas, USA',
        'Galleria, Houston, Texas, USA',
        'Montrose, Houston, Texas, USA',
        'Friendswood, Texas, USA',
        'Humble, Texas, USA',
        'Spring, Texas, USA',
        'Stafford, Texas, USA',
        'Pasadena, Texas, USA',
        'Cypress, Texas, USA',
        'Baytown, Texas, USA',
    ],

    Chicago: [
        'The Loop, Chicago, Illinois, USA',
        'Lincoln Park, Chicago, Illinois, USA',
        'Wicker Park, Chicago, Illinois, USA',
        'Evanston, Illinois, USA',
        'Naperville, Illinois, USA',
        'Oak Park, Illinois, USA',
        'Schaumburg, Illinois, USA',
        'Elmhurst, Illinois, USA',
        'Lakeview, Chicago, Illinois, USA',
        'Pilsen, Chicago, Illinois, USA',
        'Logan Square, Chicago, Illinois, USA',
        'Hyde Park, Chicago, Illinois, USA',
        'Downers Grove, Illinois, USA',
        'Arlington Heights, Illinois, USA',
        'Joliet, Illinois, USA',
    ],

    Miami: [
        'Downtown Miami, Florida, USA',
        'Wynwood, Miami, Florida, USA',
        'Coral Gables, Florida, USA',
        'Hialeah, Florida, USA',
        'Aventura, Florida, USA',
        'Brickell, Miami, Florida, USA',
        'Little Havana, Miami, Florida, USA',
        'Doral, Florida, USA',
        'Kendall, Miami, Florida, USA',
        'Homestead, Florida, USA',
        'North Miami Beach, Florida, USA',
        'Sweetwater, Florida, USA',
        'Opa-locka, Florida, USA',
        'Miramar, Florida, USA',
        'Pembroke Pines, Florida, USA',
    ],
};

/** All US metro city keys */
export const US_CITIES = Object.keys(US_LOCATION_ROTATION);

/** Total US neighborhoods available */
export const US_TOTAL_SUBURBS = Object.values(US_LOCATION_ROTATION).reduce(
    (acc, suburbs) => acc + suburbs.length,
    0
);

/**
 * Get today's US city based on day of year
 * Cycles through cities daily
 */
export function getTodaysUSCity(): string {
    const dayOfYear = Math.floor(
        (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) /
            (1000 * 60 * 60 * 24)
    );
    const cityIndex = dayOfYear % US_CITIES.length;
    return US_CITIES[cityIndex];
}

/**
 * Get all neighborhoods for a US city
 */
export function getUSSuburbsForCity(city: string): string[] {
    return US_LOCATION_ROTATION[city] || [];
}

/**
 * Flat list of all US locations (for UI pickers and full rotations)
 */
export function getAllUSLocations(): string[] {
    return Object.values(US_LOCATION_ROTATION).flat();
}

/**
 * US location hierarchy for the UI location picker
 * Returns: { state, cities: { [cityKey]: neighborhoods[] } }
 */
export const US_LOCATION_HIERARCHY: Record<string, { label: string; neighborhoods: string[] }> = {
    NewYork: {
        label: 'New York',
        neighborhoods: US_LOCATION_ROTATION.NewYork,
    },
    LosAngeles: {
        label: 'Los Angeles',
        neighborhoods: US_LOCATION_ROTATION.LosAngeles,
    },
    Houston: {
        label: 'Houston',
        neighborhoods: US_LOCATION_ROTATION.Houston,
    },
    Chicago: {
        label: 'Chicago',
        neighborhoods: US_LOCATION_ROTATION.Chicago,
    },
    Miami: {
        label: 'Miami',
        neighborhoods: US_LOCATION_ROTATION.Miami,
    },
};
