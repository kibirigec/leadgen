
import dotenv from 'dotenv';
import path from 'path';

// Load env from project root
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import { initializeFirebase } from '../firebase';
import { runDispatch } from '../dispatch-runner';

async function main() {
    console.log('Initializing Firebase...');
    await initializeFirebase();

    console.log('Starting manual dispatch for LEADS_LUNCH...');

    // Simple logger
    const log = (level: string, message: string) => {
        console.log(`[${level.toUpperCase()}] ${message}`);
    };

    try {
        const result = await runDispatch('lunch', log);
        console.log('Dispatch complete:', result);
    } catch (error) {
        console.error('Dispatch failed:', error);
    }

    process.exit(0);
}

main().catch(console.error);
