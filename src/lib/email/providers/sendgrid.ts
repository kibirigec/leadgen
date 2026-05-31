import { EmailAddress, EmailTemplateName, SendResult } from '../types';
import { EmailService } from '../service';

export class SendGridProvider implements EmailService {
  private apiKey: string;
  private fromEmail: string;
  private isDryRun: boolean;

  constructor() {
    this.apiKey = process.env.SENDGRID_API_KEY || '';
    this.fromEmail = process.env.EMAIL_FROM || 'noreply@leadgen.com';
    this.isDryRun = process.env.ENABLE_EMAIL_US !== 'true';

    if (!this.isDryRun && !this.apiKey) {
      console.warn('[SendGridProvider] No SENDGRID_API_KEY provided. Dry-run mode will be used.');
      this.isDryRun = true;
    }
  }

  async send(
    to: EmailAddress,
    template: EmailTemplateName,
    data: Record<string, unknown>
  ): Promise<SendResult> {
    if (this.isDryRun) {
      console.log(
        `[SendGridProvider DRY-RUN] Skipping email send. to=${to} template=${template}`,
        data
      );
      return { success: true, messageId: 'dry-run' };
    }

    try {
      const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(this.buildMailPayload(to, template, data)),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`SendGrid API error: ${response.status} - ${errorText}`);
      }

      // SendGrid returns 202 Accepted with no body
      const messageId = response.headers.get('x-message-id') || `sendgrid-${Date.now()}`;
      console.log(`[SendGridProvider] Email sent successfully to ${to}. Message ID: ${messageId}`);
      return { success: true, messageId };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[SendGridProvider] Failed to send email to ${to}: ${errorMessage}`);
      return { success: false, info: { error: errorMessage } };
    }
  }

  private buildMailPayload(
    to: EmailAddress,
    template: EmailTemplateName,
    data: Record<string, unknown>
  ): Record<string, unknown> {
    // Extract personalization data - templates typically use variables for dynamic content
    const personalizationSubstitutions: Record<string, string> = {};

    // Convert template data to SendGrid substitution format
    Object.entries(data).forEach(([key, value]) => {
      // Convert snake_case or camelCase to SendGrid template variable format (-key-)
      const varName = `-${key}-`;
      personalizationSubstitutions[varName] = String(value);
    });

    return {
      personalizations: [
        {
          to: [{ email: to }],
          substitutions: personalizationSubstitutions,
        },
      ],
      from: {
        email: this.fromEmail,
      },
      template_id: template,
    };
  }
}

export default SendGridProvider;
