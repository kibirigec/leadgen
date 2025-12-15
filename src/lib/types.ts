export interface Business {
    id: string;
    name: string;
    category: string;
    phone: string;
    website: string | null;
    address: string;
    location: string;
    isTarget: boolean;
    status?: "new" | "contacted";
    lastContactedAt?: string;
    savedAt?: string;
}

export interface BusinessCategory {
    id: string;
    name: string;
    count: number;
}
