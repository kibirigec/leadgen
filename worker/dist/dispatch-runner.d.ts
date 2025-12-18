/**
 * Dispatch Runner
 *
 * Runs the WhatsApp bot for a specific time window
 */
type LogFn = (level: string, message: string) => void;
type TimeWindow = 'morning' | 'lunch' | 'evening';
export declare function runDispatch(window: TimeWindow, log: LogFn): Promise<{
    success: boolean;
    sentCount: number;
}>;
export {};
