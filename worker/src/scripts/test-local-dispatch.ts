
import { runWhatsAppBot } from '../bot';

async function main() {
    console.log('[TEST] Starting Local Debug Dispatch...');
    console.log('[TEST] Target Number: 256775910888');

    const testLeads = [
        {
            id: 'test-lead-1',
            name: 'Test Business',
            phone: '256775910888', // The requested test number
            businessType: 'restaurant',
            city: 'Kampala',
            website: 'https://google.com',
            status: 'pending' as const
        }
    ];

    const log = (level: string, message: string) => {
        const timestamp = new Date().toLocaleTimeString();
        console.log(`${timestamp} [${level.toUpperCase()}] ${message}`);
    };

    try {
        await runWhatsAppBot(testLeads, log);
        console.log('[TEST] Dispatch completed.');
    } catch (error) {
        console.error('[TEST] Dispatch failed:', error);
    }
}

main();
