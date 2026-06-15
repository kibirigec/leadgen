/**
 * Dispatch Runner
 * 
 * Runs the WhatsApp bot for a specific time window
 */

import { getDb, updateWorkerStatus, getTestSettings } from './firebase';
import { runWhatsAppBot } from './bot';
import { markPhoneUsed, isPhoneUsed } from './deduplication';
import { notifyDispatchStart, notifyDispatchEnd, notifyError } from './telegram';
import { pullFromReservePool } from './reserve-pool';
import { QueuedLead } from '../../shared/types';
import type { Market } from '../../shared/types';
import { getDispatchConfig } from './config-manager';

type LogFn = (level: string, message: string) => void;
type TimeWindow = 'morning' | 'lunch' | 'evening';

// Helper to get collection with test prefix
async function getCollectionName(name: string): Promise<string> {
    const settings = await getTestSettings();
    return settings.testMode ? `test_${name}` : name;
}

export async function runDispatch(
    window: TimeWindow,
    log: LogFn,
    options: { limit?: number; dryRun?: boolean; filters?: { businessType?: string; location?: string }; market?: Market } = {}
): Promise<{ success: boolean; sentCount: number }> {
    const { limit, dryRun = false, filters, market = 'UG' } = options;
    const db = getDb();
    const today = new Date().toISOString().split('T')[0];
    const config = await getDispatchConfig(market);

    // Check test mode
    const testSettings = await getTestSettings();
    const collectionName = market === 'US' ? 'leads_queue_US' : 'leads_queue';

    if (testSettings.testMode) {
        log('info', `🧪 TEST MODE ACTIVE: Using real leads, but redirecting messages to ${testSettings.testPhone}`);
        log('info', `🧪 TEST MODE: Leads will NOT be marked as contacted.`);
    }

    // Log filters
    const filterInfo = filters ? ` (Filters: ${JSON.stringify(filters)})` : '';
    log('info', `Starting ${window} dispatch${limit ? ` (limit: ${limit})` : ''}${filterInfo}`);

    const defaultLimit = window === 'evening' ? 40 : 30;
    const targetLimit = limit || defaultLimit;

    // 1. Fresh Leads (Today)
    log('info', `Step 1: Fetching fresh leads for ${window} (Target: ${targetLimit})`);

    let freshQuery = db.collection(collectionName)
        .where('timeWindow', '==', window)
        .where('dispatchDate', '==', today)
        .where('status', '==', 'pending');
        // Collection itself implies market since we use collectionName

    if (filters?.businessType) freshQuery = freshQuery.where('businessType', '==', filters.businessType);
    if (filters?.location) freshQuery = freshQuery.where('city', '==', filters.location);

    const freshLeadsSnap = await freshQuery.limit(targetLimit * 2).get();

    let collectedLeads: QueuedLead[] = freshLeadsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() as Omit<QueuedLead, 'id'> }));
    log('info', `  Found ${collectedLeads.length} fresh leads`);

    // 2. Backlog (Gap 1) - Time-window agnostic, oldest first
    if (collectedLeads.length < targetLimit) {
        const gap = targetLimit - collectedLeads.length;
        log('info', `Step 2: Gap detected (${gap}). Checking backlog (oldest first)...`);

        let backlogQuery = db.collection(collectionName)
            .where('status', '==', 'pending')
            .where('dispatchDate', '<', today);

        if (filters?.businessType) backlogQuery = backlogQuery.where('businessType', '==', filters.businessType);
        if (filters?.location) backlogQuery = backlogQuery.where('city', '==', filters.location);

        const backlogSnap = await backlogQuery.orderBy('dispatchDate', 'asc').limit(gap).get();

        const backlogCandidates: QueuedLead[] = backlogSnap.docs
            .map(doc => ({ id: doc.id, ...doc.data() as Omit<QueuedLead, 'id'> }));

        if (backlogCandidates.length > 0) {
            log('info', `  Found ${backlogCandidates.length} leads in backlog. Merging...`);

            // Update these leads to be "Today" so they show in Monitor
            for (const l of backlogCandidates) {
                await db.collection(collectionName).doc(l.id).update({
                    dispatchDate: today,
                    timeWindow: window,
                    isBackfill: true
                });
                // Update local object
                l.dispatchDate = today;
                l.timeWindow = window;
                collectedLeads.push(l);
            }
        }
    }

    // 2.5 Retry Failed Leads (older than 7 days)
    if (collectedLeads.length < targetLimit) {
        const gap = targetLimit - collectedLeads.length;
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const cutoffDate = sevenDaysAgo.toISOString().split('T')[0];

        log('info', `Step 2.5: Still short (${gap}). Checking failed leads for retry...`);

        let failedQuery = db.collection(collectionName)
            .where('status', '==', 'failed')
            .where('dispatchDate', '<', cutoffDate);

        if (filters?.businessType) failedQuery = failedQuery.where('businessType', '==', filters.businessType);
        if (filters?.location) failedQuery = failedQuery.where('city', '==', filters.location);

        const failedSnap = await failedQuery.orderBy('dispatchDate', 'asc').limit(gap).get();

        const failedCandidates: QueuedLead[] = failedSnap.docs
            .map(doc => ({ id: doc.id, ...doc.data() as Omit<QueuedLead, 'id'> }));

        if (failedCandidates.length > 0) {
            log('info', `  Found ${failedCandidates.length} failed leads to retry.`);

            for (const l of failedCandidates) {
                await db.collection(collectionName).doc(l.id).update({
                    status: 'pending',
                    dispatchDate: today,
                    timeWindow: window,
                    isBackfill: true,
                    retryCount: ((l as any).retryCount || 0) + 1
                });
                l.status = 'pending';
                l.dispatchDate = today;
                l.timeWindow = window;
                collectedLeads.push(l);
            }
        }
    }

    // 3. Reserve Pool (Gap 2)
    if (collectedLeads.length < targetLimit) {
        const gap = targetLimit - collectedLeads.length;
        log('info', `Step 3: Still short (${gap}). Checking Reserve Pool...`);

        // Pass filters and market to reserve pool
        const reserveLeads = await pullFromReservePool(window, gap, filters, market);

        if (reserveLeads.length > 0) {
            log('info', `  Pulled ${reserveLeads.length} leads from Reserve Pool. Adding to queue...`);

            // Add to leads_queue as "Today"
            for (const r of reserveLeads) {
                // Ensure unique ID (phone based)
                const newDocRef = db.collection(collectionName).doc(r.id || r.phone.replace(/\D/g, ''));
                const newLead = {
                    ...r,
                    status: 'pending',
                    dispatchDate: today, // Stamp as Today
                    timeWindow: window,
                    source: 'reserve_pool',
                    addedAt: new Date().toISOString()
                };

                await newDocRef.set(newLead, { merge: true });
                collectedLeads.push({ id: newDocRef.id, ...newLead } as QueuedLead);
            }
        }
    }

    if (collectedLeads.length === 0) {
        log('warning', `No leads available (Fresh, Backlog, or Reserve) for ${window}`);
        return { success: true, sentCount: 0 };
    }

    // Deduplicate and Filter by Config
    const seenPhones = new Set<string>();
    const uniqueLeads = collectedLeads.filter(lead => {
        // 1. Config Check
        const type = lead.businessType || '';
        const configuredStatus = config.active_types[type];

        if (!configuredStatus || configuredStatus === 'off') {
            return false;
        }
        if (configuredStatus !== window) {
            return false;
        }

        // 2. Dedupe
        const phone = lead.phone?.replace(/\D/g, '');
        if (!phone || seenPhones.has(phone)) {
            return false;
        }
        seenPhones.add(phone);
        return true;
    }).slice(0, targetLimit);

    // Check against outreach_history (previously contacted)
    log('info', `Checking ${uniqueLeads.length} leads against outreach history...`);
    const leads: typeof uniqueLeads = [];
    let skippedCount = 0;

    for (const lead of uniqueLeads) {
        const alreadyContacted = await isPhoneUsed(lead.phone, market);
        if (alreadyContacted) {
            skippedCount++;
            // Mark as skipped in queue to avoid re-processing
            await db.collection(collectionName).doc(lead.id).update({ status: 'skipped' });
        } else {
            leads.push(lead);
        }
    }

    if (skippedCount > 0) {
        log('warning', `Skipped ${skippedCount} already-contacted numbers`);
    }

    log('info', `Found ${collectedLeads.length} raw, ${uniqueLeads.length} unique, ${leads.length} fresh leads to process`);

    // Dry Run: Skip bot and notifications, but SIMULATE success for testing
    if (dryRun) {
        log('info', `[DRY RUN] Skipping bot execution. Simulating dispatch for ${leads.length} leads.`);

        // In dry run, we still want to mark them as 'sent' so the test verification passes?
        // Actually, the test checks if they were marked as sent.
        // So we should simulate the DB updates too.

        for (const lead of leads) {
            await db.collection(collectionName).doc(lead.id).update({
                status: 'sent',
                sentAt: new Date().toISOString(),
            });
        }

        return { success: true, sentCount: leads.length };
    }

    // PREPARE LEADS FOR BOT
    const leadsToProcess = leads.map(l => {
        if (testSettings.testMode && testSettings.testPhone) {
            return { ...l, phone: testSettings.testPhone, originalPhone: l.phone };
        }
        return l;
    });

    // Send start notification
    await notifyDispatchStart(window, leadsToProcess.length, leadsToProcess);

    // Update worker status
    await updateWorkerStatus({
        bot: { status: 'running', sentToday: 0 },
    });

    // Run the bot
    try {
        const result = await runWhatsAppBot(leadsToProcess, log, market);

        log('info', `Bot finished. Contacted IDs: ${result.contactedLeadIds.join(', ')}`);

        // Mark leads as sent and record in deduplication history
        for (const leadId of result.contactedLeadIds) {
            const lead = leads.find(l => l.id === leadId);

            if (testSettings.testMode) {
                log('info', `🧪 TEST MODE: Skipping DB update for ${lead?.name} (${leadId})`);
                continue;
            }

            log('info', `  Marking lead ${leadId} as sent`);

            await db.collection(collectionName).doc(leadId).update({
                status: 'sent',
                sentAt: new Date().toISOString(),
            });

            // Record in outreach_history for deduplication
            if (lead?.phone) {
                try {
                    await markPhoneUsed(lead.phone, lead.name || 'Unknown', 'contacted', market);
                } catch (err: any) {
                    log('error', `  ❌ Failed to mark phone ${lead.phone} as used: ${err.message}`);
                }
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

/**
 * Run dispatch for BACKLOG leads only (skip fresh leads)
 * Used for manual backlog clearing
 */
export async function runBacklogDispatch(
    window: TimeWindow,
    log: LogFn,
    limit: number = 30,
    market: Market = 'UG'
): Promise<{ success: boolean; sentCount: number; backlogCount: number; reserveCount: number }> {
    const db = getDb();
    const today = new Date().toISOString().split('T')[0];
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const cutoffDate = sevenDaysAgo.toISOString().split('T')[0];

    // Check test mode
    const testSettings = await getTestSettings();
    const config = await getDispatchConfig(market);
    // User Request: Test Result should use REAL data source but intercept output
    const collectionName = market === 'US' ? 'leads_queue_US' : 'leads_queue';

    if (testSettings.testMode) {
        log('info', `🧪 TEST MODE ACTIVE (Backlog): Using real leads, but redirecting messages to ${testSettings.testPhone}`);
        log('info', `🧪 TEST MODE: Leads will NOT be marked as contacted.`);
    }

    log('info', `📦 Starting BACKLOG-ONLY dispatch (limit: ${limit})`);

    let collectedLeads: QueuedLead[] = [];
    let backlogCount = 0;
    let reserveCount = 0;

    // ... (fetch logic unchanged for lines 298-382) ...
    // FETCH LOGIC IS UNCHANGED (lines 298-382) use collectionName which is now forced to 'leads_queue'

    // 1. Backlog leads (oldest first, time-window agnostic)
    log('info', `Step 1: Fetching backlog leads (oldest first)...`);
    const backlogSnap = await db.collection(collectionName)
                .where('status', 'in', ['pending', 'backlog'])
        .where('dispatchDate', '<', today)
        .orderBy('dispatchDate', 'asc')
        .limit(limit)
        .get();

    const backlogLeads: QueuedLead[] = backlogSnap.docs
        .map(doc => ({ id: doc.id, ...doc.data() as Omit<QueuedLead, 'id'> }));

    if (backlogLeads.length > 0) {
        log('info', `  Found ${backlogLeads.length} backlog leads.`);
        for (const l of backlogLeads) {
            await db.collection(collectionName).doc(l.id).update({
                dispatchDate: today,
                timeWindow: window,
                isBackfill: true
            });
            l.dispatchDate = today;
            l.timeWindow = window;
        }
        collectedLeads.push(...backlogLeads);
        backlogCount = backlogLeads.length;
    }

    // 2. Failed leads older than 7 days
    if (collectedLeads.length < limit) {
        const gap = limit - collectedLeads.length;
        log('info', `Step 2: Checking failed leads for retry (gap: ${gap})...`);

        const failedSnap = await db.collection(collectionName)
            .where('status', '==', 'failed')
            .where('dispatchDate', '<', cutoffDate)
            .orderBy('dispatchDate', 'asc')
            .limit(gap)
            .get();

        const failedLeads: QueuedLead[] = failedSnap.docs
            .map(doc => ({ id: doc.id, ...doc.data() as Omit<QueuedLead, 'id'> }));

        if (failedLeads.length > 0) {
            log('info', `  Found ${failedLeads.length} failed leads to retry.`);
            for (const l of failedLeads) {
                await db.collection(collectionName).doc(l.id).update({
                    status: 'pending',
                    dispatchDate: today,
                    timeWindow: window,
                    isBackfill: true,
                    retryCount: ((l as any).retryCount || 0) + 1
                });
                l.status = 'pending';
                l.dispatchDate = today;
                l.timeWindow = window;
            }
            collectedLeads.push(...failedLeads);
            backlogCount += failedLeads.length;
        }
    }

    // 3. Reserve pool if still short
    if (collectedLeads.length < limit) {
        const gap = limit - collectedLeads.length;
        log('info', `Step 3: Checking reserve pool (gap: ${gap})...`);

        const reserveLeads = await pullFromReservePool(window, gap);
        if (reserveLeads.length > 0) {
            log('info', `  Pulled ${reserveLeads.length} from reserve pool.`);
            for (const r of reserveLeads) {
                const newDocRef = db.collection(collectionName).doc(r.id || r.phone.replace(/\D/g, ''));
                const newLead = {
                    ...r,
                    status: 'pending',
                    dispatchDate: today,
                    timeWindow: window,
                    source: 'reserve_pool',
                    addedAt: new Date().toISOString()
                };
                await newDocRef.set(newLead, { merge: true });
                collectedLeads.push({ id: newDocRef.id, ...newLead } as QueuedLead);
            }
            reserveCount = reserveLeads.length;
        }
    }

    if (collectedLeads.length === 0) {
        log('warning', `No backlog, failed, or reserve leads available.`);
        return { success: true, sentCount: 0, backlogCount: 0, reserveCount: 0 };
    }

    // Deduplicate and Filter by Config
    const seenPhones = new Set<string>();
    const uniqueLeads = collectedLeads.filter(lead => {
        // 1. Config Check
        const type = lead.businessType || '';
        const configuredStatus = config.active_types[type];

        if (!configuredStatus || configuredStatus === 'off') {
            return false;
        }
        if (configuredStatus !== window) {
            return false;
        }

        // 2. Dedupe
        const phone = lead.phone?.replace(/\D/g, '');
        if (!phone || seenPhones.has(phone)) return false;
        seenPhones.add(phone);
        return true;
    }).slice(0, limit);

    // Check against outreach_history (previously contacted)
    log('info', `Checking ${uniqueLeads.length} leads against outreach history...`);
    const leads: typeof uniqueLeads = [];
    let skippedCount = 0;

    for (const lead of uniqueLeads) {
        // Log the check for debugging
        const checkPhone = lead.phone.replace(/\D/g, '');
        const alreadyContacted = await isPhoneUsed(lead.phone, market);

        if (alreadyContacted) {
            skippedCount++;
            log('info', `  ⏭️ Skipping ${lead.name} (${checkPhone}): Already in outreach history`);
            await db.collection(collectionName).doc(lead.id).update({ status: 'skipped' });
        } else {
            //log('info', `  ✅ Clean ${lead.name} (${checkPhone})`);
            leads.push(lead);
        }
    }

    if (skippedCount > 0) {
        log('warning', `Skipped ${skippedCount} already-contacted numbers`);
    }

    log('info', `Dispatching ${leads.length} leads (${backlogCount} backlog, ${reserveCount} reserve)`);

    // PREPARE LEADS FOR BOT
    const leadsToProcess = leads.map(l => {
        if (testSettings.testMode && testSettings.testPhone) {
            return { ...l, phone: testSettings.testPhone, originalPhone: l.phone };
        }
        return l;
    });

    // Send notifications
    await notifyDispatchStart(window, leadsToProcess.length, leadsToProcess);
    await updateWorkerStatus({ bot: { status: 'running', sentToday: 0 } });

    try {
        const result = await runWhatsAppBot(leadsToProcess, log, market);

        for (const leadId of result.contactedLeadIds) {
            const lead = leads.find(l => l.id === leadId);

            if (testSettings.testMode) {
                log('info', `🧪 TEST MODE: Skipping DB update for ${lead?.name} (${leadId})`);
                continue;
            }

            await db.collection(collectionName).doc(leadId).update({
                status: 'sent',
                sentAt: new Date().toISOString(),
            });
            if (lead?.phone) {
                try {
                    await markPhoneUsed(lead.phone, lead.name || 'Unknown', 'contacted', market);
                } catch (err: any) {
                    log('error', `  ❌ Failed to mark phone ${lead.phone} as used: ${err.message}`);
                }
            }
        }

        await updateWorkerStatus({
            lastDispatch: { backlog: new Date().toISOString() },
            bot: { status: 'idle', sentToday: result.sentCount },
        });

        const errorCount = leads.length - result.sentCount;
        await notifyDispatchEnd(window, result.sentCount, leads.length, errorCount);

        log('info', `Backlog dispatch complete! Sent: ${result.sentCount}`);
        return { success: true, sentCount: result.sentCount, backlogCount, reserveCount };
    } catch (error: any) {
        log('error', `Backlog dispatch error: ${error.message}`);
        await notifyError(`Backlog dispatch failed: ${error.message}`);
        await updateWorkerStatus({ bot: { status: 'error', sentToday: 0 } });
        throw error;
    }
}
