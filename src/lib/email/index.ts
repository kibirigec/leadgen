import EmailServiceFactory from './service';
export { getQueue, resetQueue } from './queue';
export type { QueuedEmail, EmailQueue } from './queue';
export {
  getScheduler,
  startEmailScheduler,
  stopEmailScheduler,
  resetScheduler,
  getSchedulerStats,
  initializeEmailScheduler,
} from './cron';

export const emailService = EmailServiceFactory();
export default emailService;
