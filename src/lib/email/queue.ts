import { EmailAddress, EmailTemplateName, SendResult } from './types';
import { EmailServiceFactory } from './service';

export interface QueuedEmail {
  id: string;
  to: EmailAddress;
  template: EmailTemplateName;
  data: Record<string, unknown>;
  retries: number;
  maxRetries: number;
  nextRetryTime: number;
  createdAt: number;
}

export interface EmailQueue {
  enqueue(to: EmailAddress, template: EmailTemplateName, data: Record<string, unknown>): Promise<string>;
  processNext(): Promise<SendResult | null>;
  getQueueSize(): Promise<number>;
  getQueue(): Promise<QueuedEmail[]>;
}

// In-memory queue implementation
class InMemoryQueue implements EmailQueue {
  private queue: Map<string, QueuedEmail> = new Map();
  private processing = false;

  async enqueue(
    to: EmailAddress,
    template: EmailTemplateName,
    data: Record<string, unknown>
  ): Promise<string> {
    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const email: QueuedEmail = {
      id,
      to,
      template,
      data,
      retries: 0,
      maxRetries: 5,
      nextRetryTime: Date.now(),
      createdAt: Date.now(),
    };
    this.queue.set(id, email);
    return id;
  }

  async processNext(): Promise<SendResult | null> {
    if (this.processing) {
      return null;
    }

    // Find next email ready to send
    let nextEmail: QueuedEmail | null = null;
    let nextId: string | null = null;

    for (const [id, email] of this.queue.entries()) {
      if (email.nextRetryTime <= Date.now()) {
        if (!nextEmail || email.nextRetryTime < nextEmail.nextRetryTime) {
          nextEmail = email;
          nextId = id;
        }
      }
    }

    if (!nextEmail || !nextId) {
      return null;
    }

    this.processing = true;
    try {
      const emailService = EmailServiceFactory();
      const result = await emailService.send(nextEmail.to, nextEmail.template, nextEmail.data);

      if (result.success) {
        this.queue.delete(nextId);
        return result;
      } else {
        // Retry with exponential backoff
        if (nextEmail.retries < nextEmail.maxRetries) {
          nextEmail.retries++;
          const backoffMs = Math.pow(2, nextEmail.retries) * 1000; // 2s, 4s, 8s, 16s, 32s
          nextEmail.nextRetryTime = Date.now() + backoffMs;
        } else {
          // Max retries exceeded, remove from queue
          this.queue.delete(nextId);
        }
        return result;
      }
    } finally {
      this.processing = false;
    }
  }

  async getQueueSize(): Promise<number> {
    return this.queue.size;
  }

  async getQueue(): Promise<QueuedEmail[]> {
    return Array.from(this.queue.values());
  }
}

// Redis queue implementation
class RedisQueue implements EmailQueue {
  private redisUrl: string;
  private redis: any;
  private processing = false;
  private prefix = 'email_queue:';

  constructor(redisUrl: string) {
    this.redisUrl = redisUrl;
  }

  private async getRedis() {
    if (!this.redis) {
      // Lazy-load redis
      const { createClient } = await import('redis');
      this.redis = createClient({ url: this.redisUrl });
      await this.redis.connect();
    }
    return this.redis;
  }

  async enqueue(
    to: EmailAddress,
    template: EmailTemplateName,
    data: Record<string, unknown>
  ): Promise<string> {
    const client = await this.getRedis();
    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const email: QueuedEmail = {
      id,
      to,
      template,
      data,
      retries: 0,
      maxRetries: 5,
      nextRetryTime: Date.now(),
      createdAt: Date.now(),
    };
    await client.hSet(`${this.prefix}${id}`, {
      id,
      to,
      template,
      data: JSON.stringify(data),
      retries: String(email.retries),
      maxRetries: String(email.maxRetries),
      nextRetryTime: String(email.nextRetryTime),
      createdAt: String(email.createdAt),
    });
    // Add to sorted set for ordering by retry time
    await client.zAdd(`${this.prefix}pending`, {
      score: email.nextRetryTime,
      value: id,
    });
    return id;
  }

  async processNext(): Promise<SendResult | null> {
    if (this.processing) {
      return null;
    }

    const client = await this.getRedis();
    // Get email with lowest nextRetryTime that's due now
    const ids = await client.zRangeByScore(`${this.prefix}pending`, '-inf', Date.now(), {
      limit: 0,
      count: 1,
    });

    if (!ids || ids.length === 0) {
      return null;
    }

    const nextId = ids[0];
    this.processing = true;

    try {
      const emailData = await client.hGetAll(`${this.prefix}${nextId}`);
      if (!emailData || !emailData.id) {
        return null;
      }

      const email: QueuedEmail = {
        id: emailData.id,
        to: emailData.to,
        template: emailData.template,
        data: JSON.parse(emailData.data),
        retries: parseInt(emailData.retries, 10),
        maxRetries: parseInt(emailData.maxRetries, 10),
        nextRetryTime: parseInt(emailData.nextRetryTime, 10),
        createdAt: parseInt(emailData.createdAt, 10),
      };

      const emailService = EmailServiceFactory();
      const result = await emailService.send(email.to, email.template, email.data);

      if (result.success) {
        await client.del(`${this.prefix}${nextId}`);
        await client.zRem(`${this.prefix}pending`, nextId);
        return result;
      } else {
        // Retry with exponential backoff
        if (email.retries < email.maxRetries) {
          email.retries++;
          const backoffMs = Math.pow(2, email.retries) * 1000;
          email.nextRetryTime = Date.now() + backoffMs;
          await client.hSet(`${this.prefix}${nextId}`, {
            retries: String(email.retries),
            nextRetryTime: String(email.nextRetryTime),
          });
          await client.zAdd(`${this.prefix}pending`, {
            score: email.nextRetryTime,
            value: nextId,
          });
        } else {
          // Max retries exceeded
          await client.del(`${this.prefix}${nextId}`);
          await client.zRem(`${this.prefix}pending`, nextId);
        }
        return result;
      }
    } finally {
      this.processing = false;
    }
  }

  async getQueueSize(): Promise<number> {
    const client = await this.getRedis();
    return await client.zCard(`${this.prefix}pending`);
  }

  async getQueue(): Promise<QueuedEmail[]> {
    const client = await this.getRedis();
    const ids = await client.zRange(`${this.prefix}pending`, 0, -1);
    const emails: QueuedEmail[] = [];

    for (const id of ids) {
      const emailData = await client.hGetAll(`${this.prefix}${id}`);
      if (emailData && emailData.id) {
        emails.push({
          id: emailData.id,
          to: emailData.to,
          template: emailData.template,
          data: JSON.parse(emailData.data),
          retries: parseInt(emailData.retries, 10),
          maxRetries: parseInt(emailData.maxRetries, 10),
          nextRetryTime: parseInt(emailData.nextRetryTime, 10),
          createdAt: parseInt(emailData.createdAt, 10),
        });
      }
    }

    return emails;
  }
}

let queueInstance: EmailQueue | null = null;

export function getQueue(): EmailQueue {
  if (!queueInstance) {
    const redisUrl = process.env.REDIS_URL;
    if (redisUrl) {
      queueInstance = new RedisQueue(redisUrl);
    } else {
      queueInstance = new InMemoryQueue();
    }
  }
  return queueInstance;
}

export function resetQueue(): void {
  queueInstance = null;
}
