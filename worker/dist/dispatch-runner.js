"use strict";
/**
 * Dispatch Runner
 *
 * Runs the WhatsApp bot for a specific time window
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.runDispatch = runDispatch;
const firebase_1 = require("./firebase");
const bot_1 = require("./bot");
async function runDispatch(window, log) {
    const db = (0, firebase_1.getDb)();
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
        ...doc.data(),
    }));
    log('info', `Found ${leads.length} leads to process`);
    // Update worker status
    await (0, firebase_1.updateWorkerStatus)({
        bot: { status: 'running', sentToday: 0 },
    });
    // Run the bot
    try {
        const result = await (0, bot_1.runWhatsAppBot)(leads, log);
        // Mark leads as sent
        for (const leadId of result.contactedLeadIds) {
            await db.collection('leads_queue').doc(leadId).update({
                status: 'sent',
                sentAt: new Date().toISOString(),
            });
        }
        // Update worker status
        await (0, firebase_1.updateWorkerStatus)({
            lastDispatch: {
                [window]: new Date().toISOString(),
            },
            bot: { status: 'idle', sentToday: result.sentCount },
        });
        log('info', `Dispatch complete! Sent: ${result.sentCount}`);
        return { success: true, sentCount: result.sentCount };
    }
    catch (error) {
        log('error', `Bot error: ${error.message}`);
        await (0, firebase_1.updateWorkerStatus)({
            bot: { status: 'error', sentToday: 0 },
        });
        throw error;
    }
}
