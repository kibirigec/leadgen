/**
 * Dispatch Runner
 * 
 * Runs the WhatsApp bot for a specific time window
 */

import { getDb, updateWorkerStatus } from './firebase';
import { runWhatsAppBot } from './bot';

type LogFn = (level: string, message: string) => void;
type TimeWindow = 'morning' | 'lunch' | 'evening';

export async function runDispatch(
    window: TimeWindow,
    log: LogFn
): Promise<{ success: boolean; sentCount: number }> {
    const db = getDb();
    const today = new Date().toISOString().split('T')[0];

    log('info', `Starting ${window} dispatch`);

    // Get pending leads for this window
    const snapshot = await db.collection('leads_queue')
        .where('timeWindow', '==', window)
        .where('dispatchDate', '==', today)
        .where('status', '==', 'pending')
        .orderBy('priority', 'desc')
        .limit(window === 'evening' ? 40 : 30)
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

    // Update worker status
    await updateWorkerStatus({
        bot: { status: 'running', sentToday: 0 },
    });

    // Run the bot
    try {
        const result = await runWhatsAppBot(leads, log);

        // Mark leads as sent
        for (const leadId of result.contactedLeadIds) {
            await db.collection('leads_queue').doc(leadId).update({
                status: 'sent',
                sentAt: new Date().toISOString(),
            });
        }

        // Update worker status
        await updateWorkerStatus({
            lastDispatch: {
                [window]: new Date().toISOString(),
            },
            bot: { status: 'idle', sentToday: result.sentCount },
        });

        log('info', `Dispatch complete! Sent: ${result.sentCount}`);
        return { success: true, sentCount: result.sentCount };
    } catch (error: any) {
        log('error', `Bot error: ${error.message}`);
        await updateWorkerStatus({
            bot: { status: 'error', sentToday: 0 },
        });
        throw error;
    }
}
