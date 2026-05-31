import { getQueue, resetQueue, QueuedEmail } from '../queue';
import { getScheduler, stopEmailScheduler, resetScheduler } from '../cron';
import { EmailServiceFactory } from '../service';

// Mock the email service
jest.mock('../service', () => ({
  EmailServiceFactory: jest.fn(),
}));

describe('Email Queue', () => {
  beforeEach(() => {
    resetQueue();
    resetScheduler();
    stopEmailScheduler();
    jest.clearAllMocks();
  });

  afterEach(() => {
    stopEmailScheduler();
    resetScheduler();
    resetQueue();
  });

  describe('InMemoryQueue', () => {
    it('should enqueue an email and return an ID', async () => {
      const queue = getQueue();
      const id = await queue.enqueue('test@example.com', 'welcome', { name: 'John' });

      expect(id).toBeTruthy();
      expect(typeof id).toBe('string');
    });

    it('should get queue size', async () => {
      const queue = getQueue();
      expect(await queue.getQueueSize()).toBe(0);

      await queue.enqueue('test1@example.com', 'welcome', {});
      await queue.enqueue('test2@example.com', 'welcome', {});

      expect(await queue.getQueueSize()).toBe(2);
    });

    it('should retrieve queued emails', async () => {
      const queue = getQueue();
      const id1 = await queue.enqueue('test1@example.com', 'welcome', { name: 'John' });
      const id2 = await queue.enqueue('test2@example.com', 'reset_password', { token: 'abc123' });

      const emails = await queue.getQueue();
      expect(emails).toHaveLength(2);
      expect(emails[0].id).toBe(id1);
      expect(emails[1].id).toBe(id2);
      expect(emails[0].to).toBe('test1@example.com');
      expect(emails[1].template).toBe('reset_password');
    });

    it('should process next email successfully', async () => {
      const mockEmailService = {
        send: jest.fn().mockResolvedValue({ success: true, messageId: 'msg-123' }),
      };
      (EmailServiceFactory as jest.Mock).mockReturnValue(mockEmailService);

      const queue = getQueue();
      await queue.enqueue('test@example.com', 'welcome', { name: 'John' });

      const result = await queue.processNext();

      expect(result).toEqual({ success: true, messageId: 'msg-123' });
      expect(mockEmailService.send).toHaveBeenCalledWith(
        'test@example.com',
        'welcome',
        { name: 'John' }
      );
      expect(await queue.getQueueSize()).toBe(0);
    });

    it('should handle send failure and retry with exponential backoff', async () => {
      const mockEmailService = {
        send: jest.fn().mockResolvedValue({ success: false }),
      };
      (EmailServiceFactory as jest.Mock).mockReturnValue(mockEmailService);

      const queue = getQueue();
      const id = await queue.enqueue('test@example.com', 'welcome', {});

      const beforeTime = Date.now();
      await queue.processNext();
      const afterTime = Date.now();

      // Queue size should still be 1 (email not removed)
      expect(await queue.getQueueSize()).toBe(1);

      // Check that retry time has been set with backoff
      const emails = await queue.getQueue();
      expect(emails).toHaveLength(1);
      expect(emails[0].retries).toBe(1);
      expect(emails[0].nextRetryTime).toBeGreaterThan(beforeTime); // Should be in the future
      // First retry should be ~2 seconds away (2^1 * 1000ms)
      expect(emails[0].nextRetryTime - beforeTime).toBeGreaterThanOrEqual(1900);
      expect(emails[0].nextRetryTime - afterTime).toBeLessThanOrEqual(2100);
    });

    it('should apply exponential backoff for multiple retries', async () => {
      const mockEmailService = {
        send: jest.fn().mockResolvedValue({ success: false }),
      };
      (EmailServiceFactory as jest.Mock).mockReturnValue(mockEmailService);

      const queue = getQueue();
      await queue.enqueue('test@example.com', 'welcome', {});

      const times: number[] = [];
      times.push(Date.now());

      // First attempt: retry fails
      await queue.processNext();
      let emails = await queue.getQueue();
      expect(emails[0].retries).toBe(1);
      times.push(emails[0].nextRetryTime);

      // Manually set to past to process again, then process
      const firstBackoff = times[1] - times[0];
      expect(firstBackoff).toBeGreaterThanOrEqual(1900); // 2^1 = 2 seconds

      // Process again (simulate retry)
      // The queue won't process because nextRetryTime is in future, so manually test retry increment
      emails[0].retries = 1; // Already retried once
      emails[0].nextRetryTime = Date.now() - 1000; // Make it ready

      await queue.processNext();
      emails = await queue.getQueue();
      expect(emails[0].retries).toBe(2);
      
      const secondBackoff = emails[0].nextRetryTime - Date.now();
      expect(secondBackoff).toBeGreaterThanOrEqual(3900); // 2^2 = 4 seconds (minus elapsed time)
      expect(secondBackoff).toBeLessThanOrEqual(4100);
    });

    it('should remove email after max retries exceeded', async () => {
      const mockEmailService = {
        send: jest.fn().mockResolvedValue({ success: false }),
      };
      (EmailServiceFactory as jest.Mock).mockReturnValue(mockEmailService);

      const queue = getQueue();
      await queue.enqueue('test@example.com', 'welcome', {});

      // Need 6 attempts: initial + 5 retries = removal on 6th attempt
      for (let i = 0; i < 6; i++) {
        const emails = await queue.getQueue();
        if (emails.length > 0) {
          // Make email ready for processing
          emails[0].nextRetryTime = Date.now() - 1000;
        }
        const result = await queue.processNext();
        if (!result) break; // Stop if queue is empty
      }

      // After 5 retries (6 attempts total), email should be removed
      expect(await queue.getQueueSize()).toBe(0);
    });

    it('should only process one email at a time (no concurrent processing)', async () => {
      const mockEmailService = {
        send: jest.fn().mockImplementation(async () => {
          // Simulate slow send
          await new Promise(resolve => setTimeout(resolve, 50));
          return { success: true, messageId: 'msg-123' };
        }),
      };
      (EmailServiceFactory as jest.Mock).mockReturnValue(mockEmailService);

      const queue = getQueue();
      await queue.enqueue('test1@example.com', 'welcome', {});
      await queue.enqueue('test2@example.com', 'welcome', {});

      // Try to process twice concurrently
      const [result1, result2] = await Promise.all([
        queue.processNext(),
        queue.processNext(),
      ]);

      // One should return a result, one should return null (processing already in progress)
      const results = [result1, result2].filter(r => r !== null);
      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({ success: true, messageId: 'msg-123' });
    });

    it('should not process emails before their retry time', async () => {
      const mockEmailService = {
        send: jest.fn().mockResolvedValue({ success: true, messageId: 'msg-123' }),
      };
      (EmailServiceFactory as jest.Mock).mockReturnValue(mockEmailService);

      const queue = getQueue();
      const id = await queue.enqueue('test@example.com', 'welcome', {});

      // Manually set nextRetryTime far in the future
      const emails = await queue.getQueue();
      emails[0].nextRetryTime = Date.now() + 60000;

      // Should not process
      const result = await queue.processNext();
      expect(result).toBeNull();
      expect(mockEmailService.send).not.toHaveBeenCalled();
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limit via scheduler', async () => {
      const mockEmailService = {
        send: jest.fn().mockResolvedValue({ success: true, messageId: 'msg-123' }),
      };
      (EmailServiceFactory as jest.Mock).mockReturnValue(mockEmailService);

      const queue = getQueue();
      const scheduler = getScheduler({ rateLimit: 5, workerInterval: 10 });

      // Enqueue 10 emails
      for (let i = 0; i < 10; i++) {
        await queue.enqueue(`test${i}@example.com`, 'welcome', {});
      }

      expect(await queue.getQueueSize()).toBe(10);

      // Start scheduler with low rate limit
      scheduler.start();

      // Wait for some processing
      await new Promise(resolve => setTimeout(resolve, 500));

      // Check that only up to 5 have been sent
      expect(scheduler.getSendCount()).toBeLessThanOrEqual(5);
      expect(mockEmailService.send.mock.calls.length).toBeLessThanOrEqual(5);

      stopEmailScheduler();
    }, 10000);

    it('should respect SENDGRID_RATE_LIMIT environment variable', () => {
      process.env.SENDGRID_RATE_LIMIT = '50';
      // Reset scheduler instance to pick up new env var
      resetScheduler();
      const scheduler = getScheduler();

      expect(scheduler.getRateLimit()).toBe(50);

      delete process.env.SENDGRID_RATE_LIMIT;
      resetScheduler();
    });

    it('should default to 100 sends per minute', () => {
      delete process.env.SENDGRID_RATE_LIMIT;
      resetScheduler();
      const scheduler = getScheduler();

      expect(scheduler.getRateLimit()).toBe(100);
    });

    it('should track remaining sends', () => {
      resetScheduler();
      const scheduler = getScheduler({ rateLimit: 10 });
      expect(scheduler.getRemainingSends()).toBe(10);

      // Simulate some sends
      (scheduler as any).sendCount = 3;
      expect(scheduler.getRemainingSends()).toBe(7);

      // Simulate exceeding limit
      (scheduler as any).sendCount = 10;
      expect(scheduler.getRemainingSends()).toBe(0);
    });
  });

  describe('Scheduler', () => {
    it('should start and stop scheduler', () => {
      const scheduler = getScheduler({ workerInterval: 10 });
      expect(scheduler.isSchedulerRunning()).toBe(false);

      scheduler.start();
      expect(scheduler.isSchedulerRunning()).toBe(true);

      scheduler.stop();
      expect(scheduler.isSchedulerRunning()).toBe(false);
    });

    it('should not start if already running', () => {
      const scheduler = getScheduler({ workerInterval: 10 });
      scheduler.start();
      expect(scheduler.isSchedulerRunning()).toBe(true);

      // Try to start again
      scheduler.start();
      expect(scheduler.isSchedulerRunning()).toBe(true);

      scheduler.stop();
    });

    it('should reset send count every minute', async () => {
      const mockEmailService = {
        send: jest.fn().mockResolvedValue({ success: true, messageId: 'msg-123' }),
      };
      (EmailServiceFactory as jest.Mock).mockReturnValue(mockEmailService);

      const scheduler = getScheduler({ rateLimit: 100, workerInterval: 50 });
      const queue = getQueue();

      await queue.enqueue('test@example.com', 'welcome', {});

      scheduler.start();
      await new Promise(resolve => setTimeout(resolve, 100));

      const initialCount = scheduler.getSendCount();
      expect(initialCount).toBeGreaterThan(0);

      // Simulate time jump by manually resetting (in real scenario, happens after 60s)
      (scheduler as any).lastResetTime = Date.now() - 65000;

      await new Promise(resolve => setTimeout(resolve, 100));

      // Count should be reset
      expect(scheduler.getSendCount()).toBeLessThanOrEqual(initialCount);

      scheduler.stop();
    }, 10000);
  });

  describe('Email metadata', () => {
    it('should preserve all email metadata through queue', async () => {
      const queue = getQueue();
      const testData = {
        name: 'John Doe',
        email: 'john@example.com',
        confirmationUrl: 'https://example.com/confirm',
        expiryTime: 3600,
        nested: { key: 'value' },
      };

      await queue.enqueue('test@example.com', 'welcome', testData);

      const emails = await queue.getQueue();
      expect(emails[0].data).toEqual(testData);
      expect(emails[0].to).toBe('test@example.com');
      expect(emails[0].template).toBe('welcome');
      expect(emails[0].retries).toBe(0);
      expect(emails[0].maxRetries).toBe(5);
    });

    it('should track timestamps correctly', async () => {
      const queue = getQueue();
      const beforeTime = Date.now();

      const id = await queue.enqueue('test@example.com', 'welcome', {});

      const afterTime = Date.now();
      const emails = await queue.getQueue();

      expect(emails[0].createdAt).toBeGreaterThanOrEqual(beforeTime);
      expect(emails[0].createdAt).toBeLessThanOrEqual(afterTime);
      expect(emails[0].nextRetryTime).toBeGreaterThanOrEqual(beforeTime);
      expect(emails[0].nextRetryTime).toBeLessThanOrEqual(afterTime);
    });
  });
});
