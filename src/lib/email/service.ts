import { EmailAddress, EmailTemplateName, SendResult } from './types';
import { SendGridProvider } from './providers/sendgrid';

export interface EmailService {
  send(
    to: EmailAddress,
    template: EmailTemplateName,
    data: Record<string, unknown>
  ): Promise<SendResult>;
}

class MockEmailService implements EmailService {
  async send(
    to: EmailAddress,
    template: EmailTemplateName,
    data: Record<string, unknown>
  ): Promise<SendResult> {
    console.log('[MockEmailService] send', { to, template, data });
    return { success: true, messageId: 'mock' };
  }
}

export const EmailServiceFactory = (): EmailService => {
  const provider = (process.env.EMAIL_PROVIDER || 'mock').toLowerCase();

  if (provider === 'sendgrid') {
    return new SendGridProvider();
  }

  return new MockEmailService();
};

export default EmailServiceFactory;
