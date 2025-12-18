/**
 * Telegram Notifications for Worker
 * 
 * Sends notifications via Telegram Bot API
 * Works over HTTP - no SSL required!
 */

// Telegram Bot credentials
const BOT_TOKEN = '7771910683:AAEWw99GdXPj6U6L3Woh94QqFazddsANXiA';
const CHAT_ID = '6985991145';

/**
 * Send a message via Telegram
 */
async function sendTelegram(message: string): Promise<boolean> {
    try {
        const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: CHAT_ID,
                text: message,
                parse_mode: 'HTML',
            }),
        });

        if (!res.ok) {
            console.error('Telegram error:', await res.text());
            return false;
        }

        console.log('📱 Telegram notification sent');
        return true;
    } catch (error: any) {
        console.error('Telegram send failed:', error.message);
        return false;
    }
}

// ============================================
// NOTIFICATION FUNCTIONS
// ============================================

export async function notifyScrapeStart(): Promise<void> {
    await sendTelegram('🔍 <b>Scrape Started</b>\n\nScraping leads for today...');
}

export async function notifyScrapeEnd(queued: number, reserve: number): Promise<void> {
    await sendTelegram(
        `✅ <b>Scrape Complete</b>\n\n` +
        `📊 Queued: <b>${queued}</b> leads\n` +
        `📦 Reserve: <b>${reserve}</b> leads`
    );
}

export async function notifyDispatchStart(window: string, count: number): Promise<void> {
    const emoji = window === 'morning' ? '☀️' : window === 'lunch' ? '🌤️' : '🌙';
    await sendTelegram(
        `📤 <b>Dispatch Started</b>\n\n` +
        `${emoji} ${window.charAt(0).toUpperCase() + window.slice(1)} window\n` +
        `👥 <b>${count}</b> leads to contact`
    );
}

export async function notifyDispatchEnd(window: string, sent: number, total: number, errors: number): Promise<void> {
    const emoji = errors > 0 ? '⚠️' : '✅';
    await sendTelegram(
        `${emoji} <b>Dispatch Complete</b>\n\n` +
        `📬 Sent: <b>${sent}/${total}</b>\n` +
        (errors > 0 ? `❌ Errors: <b>${errors}</b>` : '✨ No errors!')
    );
}

export async function notifyError(message: string): Promise<void> {
    await sendTelegram(`❌ <b>Error</b>\n\n${message}`);
}

// Test function
export async function sendTestNotification(): Promise<boolean> {
    return await sendTelegram('🤖 <b>LeadGen Bot Connected!</b>\n\nYou will receive notifications here.');
}
