import { Business } from "./types";

const MOCK_DB: Business[] = [
    {
        id: "1",
        name: "Cafe Javas",
        category: "Restaurant",
        phone: "+256 772 123456",
        website: "https://cafejavas.co.ug",
        address: "Ntinda Complex, Kampala",
        location: "Ntinda",
    },
    {
        id: "2",
        name: "Mama Ashanti",
        category: "Restaurant",
        phone: "+256 700 987654",
        website: null,
        address: "Kyambogo Road, Ntinda",
        location: "Ntinda",
    },
    {
        id: "3",
        name: "Capital Kitchen",
        category: "Restaurant",
        phone: "+256 755 112233",
        website: "https://capitalkitchen.com",
        address: "Ntinda Shopping Centre",
        location: "Ntinda",
    },
    {
        id: "4",
        name: "Ntinda Deep Sea Fish",
        category: "Restaurant",
        phone: "+256 788 445566",
        website: null,
        address: "Stretcher Road, Ntinda",
        location: "Ntinda",
    },
    {
        id: "5",
        name: "KFC Ntinda",
        category: "Fast Food",
        phone: "+256 312 555555",
        website: "https://kfc.ug",
        address: "Ntinda Road",
        location: "Ntinda",
    },
    {
        id: "6",
        name: "Local BBQ Joint",
        category: "Street Food",
        phone: "+256 701 223344",
        website: null,
        address: "Kisaasi Road, Ntinda",
        location: "Ntinda",
    }
];

export async function searchBusinesses(query: string, location: string): Promise<Business[]> {
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 800));

    const normalizedQuery = query.toLowerCase();
    const normalizedLocation = location.toLowerCase();

    return MOCK_DB.filter((business) => {
        const matchesLocation = business.location.toLowerCase().includes(normalizedLocation);
        const matchesQuery =
            business.name.toLowerCase().includes(normalizedQuery) ||
            business.category.toLowerCase().includes(normalizedQuery);

        return matchesLocation && matchesQuery;
    }).map(b => ({
        ...b,
        isTarget: !b.website // Derived property
    }));
}
