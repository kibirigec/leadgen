/**
 * Scrape Runner
 *
 * Runs the daily scrape logic
 */
type LogFn = (level: string, message: string) => void;
export declare function runScrape(log: LogFn): Promise<{
    success: boolean;
    totalScraped: number;
}>;
export {};
