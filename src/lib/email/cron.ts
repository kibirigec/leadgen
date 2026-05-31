import { getQueue } from './queue';

interface CronJobOptions {
  rateLimit?: number; // emails per minute
  workerInterval?: number; // milliseconds between checking queue
}

class EmailScheduler {
  private intervalId: NodeJS.Timeout | null = null;
  private rateLimit: number;
  private workerInterval: number;
  private sendCount = 0;
  private lastResetTime = Date.now();
  private isRunning = false;

  constructor(options: CronJobOptions = {}) {
    // Default rate limit: 100 sends/minute (can be overridden via env var)
    this.rateLimit = options.rateLimit || parseInt(process.env.SENDGRID_RATE_LIMIT || '100', 10);
    // Worker checks queue every 100ms by default
    this.workerInterval = options.workerInterval || 100;
  }

  /**
   * Start the email worker scheduler
   * Processes queued emails at the configured rate
   */
  start(): void {
    if (this.isRunning) {
      console.warn('[EmailScheduler] Already running');
      return;
    }

    this.isRunning = true;
    console.log(`[EmailScheduler] Started with rate limit: ${this.rateLimit} emails/minute`);

    this.intervalId = setInterval(async () => {
      // Reset send count every minute
      if (Date.now() - this.lastResetTime >= 60000) {
        this.sendCount = 0;
        this.lastResetTime = Date.now();
      }

      // Process next email if under rate limit
      if (this.sendCount < this.rateLimit) {
        try {
          const queue = getQueue();
          const result = await queue.processNext();
          if (result) {
            this.sendCount++;
            if (result.success) {
              console.log(
                `[EmailScheduler] Email sent successfully. Count: ${this.sendCount}/${this.rateLimit}`
              );
            } else {
              console.warn(`[EmailScheduler] Email send failed, will retry. Count: ${this.sendCount}/${this.rateLimit}`);
            }
          }
        } catch (error) {
          console.error('[EmailScheduler] Error processing email:', error);
        }
      }
    }, this.workerInterval);
  }

  /**
   * Stop the email worker scheduler
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.isRunning = false;
      console.log('[EmailScheduler] Stopped');
    }
  }

  /**
   * Check if scheduler is running
   */
  isSchedulerRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Get current send count in this minute
   */
  getSendCount(): number {
    return this.sendCount;
  }

  /**
   * Get configured rate limit
   */
  getRateLimit(): number {
    return this.rateLimit;
  }

  /**
   * Get remaining sends allowed in this minute
   */
  getRemainingSends(): number {
    return Math.max(0, this.rateLimit - this.sendCount);
  }
}

let schedulerInstance: EmailScheduler | null = null;

/**
 * Get or create the global email scheduler instance
 */
export function getScheduler(options?: CronJobOptions): EmailScheduler {
  if (!schedulerInstance) {
    schedulerInstance = new EmailScheduler(options);
  }
  return schedulerInstance;
}

/**
 * Start the email scheduler
 */
export function startEmailScheduler(options?: CronJobOptions): void {
  const scheduler = getScheduler(options);
  scheduler.start();
}

export function resetScheduler(): void {
  if (schedulerInstance) {
    schedulerInstance.stop();
  }
  schedulerInstance = null;
}

/**
 * Stop the email scheduler
 */
export function stopEmailScheduler(): void {
  if (schedulerInstance) {
    schedulerInstance.stop();
  }
}

/**
 * Get scheduler stats
 */
export function getSchedulerStats() {
  if (!schedulerInstance) {
    return {
      running: false,
      sendCount: 0,
      rateLimit: parseInt(process.env.SENDGRID_RATE_LIMIT || '100', 10),
      remainingSends: parseInt(process.env.SENDGRID_RATE_LIMIT || '100', 10),
    };
  }

  return {
    running: schedulerInstance.isSchedulerRunning(),
    sendCount: schedulerInstance.getSendCount(),
    rateLimit: schedulerInstance.getRateLimit(),
    remainingSends: schedulerInstance.getRemainingSends(),
  };
}

/**
 * Initialize scheduler on app startup
 * Call this from your Next.js initialization (e.g., src/app.ts or API route)
 */
export async function initializeEmailScheduler(options?: CronJobOptions): Promise<void> {
  if (typeof window === 'undefined') {
    // Only run on server side
    startEmailScheduler(options);
  }
}

export default getScheduler;
