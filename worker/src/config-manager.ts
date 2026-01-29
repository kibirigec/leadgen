import { getDb } from './firebase';
import { KEYWORD_MATRIX } from './keyword-matrix';

// ==========================================
// Types
// ==========================================

export type TimeWindow = 'morning' | 'lunch' | 'evening';
export type ConfigStatus = 'morning' | 'lunch' | 'evening' | 'off';

export interface DispatchConfig {
    // Map of "business_type" -> "status/window"
    active_types: Record<string, ConfigStatus>;
    // Global Quotas per window
    quotas: Record<TimeWindow, number>;
    // Overrides (optional)
    type_quotas?: Record<string, number>;
    updatedAt: string;
}

const DEFAULT_QUOTAS: Record<TimeWindow, number> = {
    morning: 30,
    lunch: 30,
    evening: 40
};

// ==========================================
// Config Manager
// ==========================================

export async function getDispatchConfig(): Promise<DispatchConfig> {
    const db = getDb();
    const doc = await db.collection('system').doc('dispatch_config').get();

    if (doc.exists) {
        return doc.data() as DispatchConfig;
    }

    // Initialize Default Config from KEYWORD_MATRIX
    const defaultActiveTypes: Record<string, ConfigStatus> = {};
    for (const item of KEYWORD_MATRIX) {
        defaultActiveTypes[item.type] = item.timeWindow as ConfigStatus;
    }

    const defaultConfig: DispatchConfig = {
        active_types: defaultActiveTypes,
        quotas: DEFAULT_QUOTAS,
        updatedAt: new Date().toISOString()
    };

    // Save default
    await db.collection('system').doc('dispatch_config').set(defaultConfig);
    return defaultConfig;
}

export async function updateDispatchConfig(updates: Partial<DispatchConfig>): Promise<DispatchConfig> {
    const db = getDb();

    // Get current to merge
    const current = await getDispatchConfig();

    const newConfig = {
        ...current,
        ...updates,
        updatedAt: new Date().toISOString()
    };

    await db.collection('system').doc('dispatch_config').set(newConfig);
    return newConfig;
}

export async function getActiveBusinessTypes(window: TimeWindow): Promise<string[]> {
    const config = await getDispatchConfig();
    return Object.entries(config.active_types)
        .filter(([_, status]) => status === window)
        .map(([type]) => type);
}
