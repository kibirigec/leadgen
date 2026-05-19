import { getDb } from './firebase';
import { KEYWORD_MATRIX } from './keyword-matrix';
import { US_KEYWORD_MATRIX } from './keyword-matrix-us';
import type { Market } from '../../shared/types';

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
    evening: 40,
};

// ==========================================
// Firestore doc name per market
// ==========================================

function getConfigDocName(market: Market): string {
    return `dispatch_config_${market}`; // dispatch_config_UG or dispatch_config_US
}

// ==========================================
// Config Manager
// ==========================================

export async function getDispatchConfig(market: Market = 'UG'): Promise<DispatchConfig> {
    const db = getDb();
    const docName = getConfigDocName(market);
    const doc = await db.collection('system').doc(docName).get();

    if (doc.exists) {
        return doc.data() as DispatchConfig;
    }

    // Initialize default config from the correct keyword matrix
    const matrix = market === 'US' ? US_KEYWORD_MATRIX : KEYWORD_MATRIX;
    const defaultActiveTypes: Record<string, ConfigStatus> = {};
    for (const item of matrix) {
        defaultActiveTypes[item.type] = item.timeWindow as ConfigStatus;
    }

    const defaultConfig: DispatchConfig = {
        active_types: defaultActiveTypes,
        quotas: DEFAULT_QUOTAS,
        updatedAt: new Date().toISOString(),
    };

    // Save default
    await db.collection('system').doc(docName).set(defaultConfig);
    return defaultConfig;
}

export async function updateDispatchConfig(
    market: Market = 'UG',
    updates: Partial<DispatchConfig>
): Promise<DispatchConfig> {
    const db = getDb();
    const docName = getConfigDocName(market);

    // Get current to merge
    const current = await getDispatchConfig(market);

    const newConfig = {
        ...current,
        ...updates,
        updatedAt: new Date().toISOString(),
    };

    await db.collection('system').doc(docName).set(newConfig);
    return newConfig;
}

export async function getActiveBusinessTypes(window: TimeWindow, market: Market = 'UG'): Promise<string[]> {
    const config = await getDispatchConfig(market);
    return Object.entries(config.active_types)
        .filter(([_, status]) => status === window)
        .map(([type]) => type);
}
