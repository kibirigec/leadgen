/**
 * Dispatch Runner
 * 
 * Runs the WhatsApp bot for a specific time window
 */

import { getDb, updateWorkerStatus } from './firebase';
import { runWhatsAppBot } from './bot';
import { markPhoneUsed } from './deduplication';
import { notifyDispatchStart, notifyDispatchEnd, notifyError } from './notifications';

type LogFn = (level: string, message: string) => void;
type TimeWindow = 'morning' | 'lunch' | 'evening';

export async function runDispatch(
    window: TimeWindow,
    log: LogFn,
    limit?: number
): Promise<{ success: boolean; sentCount: number }> {
    const db = getDb();
    const today = new Date().toISOString().split('T')[0];

    log('info', `Starting ${window} dispatch${limit ? ` (limit: ${limit})` : ''}`);

    // Get pending leads for this window
    const defaultLimit = window === 'evening' ? 40 : 30;
    const snapshot = await db.collection('leads_queue')
        .where('timeWindow', '==', window)
        .where('dispatchDate', '==', today)
        .where('status', '==', 'pending')
        .orderBy('priority', 'desc')
        .limit(limit || defaultLimit)
        .get();

    if (snapshot.empty) {
        log('warning', `No pending leads for ${window} window`);
        return { success: true, sentCount: 0 };
    }

    const leads = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data() as any,
    }));

    log('info', `Found ${leads.length} leads to process`);

    // Send start notification
    await notifyDispatchStart(window, leads.length);

    // Update worker status
    await updateWorkerStatus({
        bot: { status: 'running', sentToday: 0 },
    });

    // Run the bot
    try {
        const result = await runWhatsAppBot(leads, log);

        log('info', `Bot finished. Contacted IDs: ${result.contactedLeadIds.join(', ')}`);

        // Mark leads as sent and record in deduplication history
        for (const leadId of result.contactedLeadIds) {
            const lead = leads.find(l => l.id === leadId);
            log('info', `  Marking lead ${leadId} as sent`);

            await db.collection('leads_queue').doc(leadId).update({
                status: 'sent',
                sentAt: new Date().toISOString(),
            });

            // Record in outreach_history for deduplication
            if (lead?.phone) {
                await markPhoneUsed(lead.phone, lead.name || 'Unknown', 'contacted');
            }
        }

        // Update worker status
        await updateWorkerStatus({
            lastDispatch: {
                [window]: new Date().toISOString(),
            },
            bot: { status: 'idle', sentToday: result.sentCount },
        });

        log('info', `Dispatch complete! Sent: ${result.sentCount}`);

        // Send completion notification
        const errorCount = leads.length - result.sentCount;
        await notifyDispatchEnd(window, result.sentCount, leads.length, errorCount);

        return { success: true, sentCount: result.sentCount };
    } catch (error: any) {
        log('error', `Bot error: ${error.message}`);
        await notifyError(`Dispatch failed: ${error.message}`);
        await updateWorkerStatus({
            bot: { status: 'error', sentToday: 0 },
        });
        throw error;
    }
}
