/**
 * WhatsApp Bot for Worker
 *
 * Simplified bot that runs in the worker process
 */
type LogFn = (level: string, message: string) => void;
interface Lead {
    id: string;
    name: string;
    phone: string;
    website?: string;
    businessType?: string;
}
export declare function runWhatsAppBot(leads: Lead[], log: LogFn): Promise<{
    success: boolean;
    sentCount: number;
    contactedLeadIds: string[];
}>;
export {};
