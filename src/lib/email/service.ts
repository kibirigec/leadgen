import { EmailAddress, EmailTemplateName, SendResult } from './types';

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

class SendGridEmailService implements EmailService {
  async send(
    to: EmailAddress,
    template: EmailTemplateName,
    data: Record<string, unknown>
  ): Promise<SendResult> {
    // Placeholder: integrate with SendGrid SDK in real implementation.
    console.log('[SendGridEmailService] sending', { to, template, data });
    return { success: true, messageId: 'sendgrid-fake-id' };
  }
}

export const EmailServiceFactory = (): EmailService => {
  const provider = (process.env.EMAIL_PROVIDER || 'mock').toLowerCase();
  const enable = process.env.ENABLE_EMAIL_US === 'true';

  if (!enable) {
    // Dry-run: do not send, just log
    return {
      async send(
        to: EmailAddress,
        template: EmailTemplateName,
        data: Record<string, unknown>
      ): Promise<SendResult> {
        console.log(`[DRY-RUN] Skipping email send. provider=${provider} to=${to} template=${template}`, data);
        return { success: true, messageId: 'dry-run' };
      }
    };
  }

  if (provider === 'sendgrid') {
    return new SendGridEmailService();
  }

  return new MockEmailService();
};

export default EmailServiceFactory;
