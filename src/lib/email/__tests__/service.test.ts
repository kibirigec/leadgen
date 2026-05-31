// Basic unit test skeleton for EmailService

describe('EmailService', () => {
  afterEach(() => {
    jest.resetModules();
    delete process.env.EMAIL_PROVIDER;
    delete process.env.ENABLE_EMAIL_US;
  });

  it('uses mock provider when EMAIL_PROVIDER=mock', async () => {
    process.env.EMAIL_PROVIDER = 'mock';
    process.env.ENABLE_EMAIL_US = 'true';
    const { emailService } = require('../index');
    const res = await emailService.send('test@example.com', 'welcome', { name: 'Test' });
    expect(res.success).toBe(true);
  });

  it('performs dry-run when ENABLE_EMAIL_US != true', async () => {
    process.env.EMAIL_PROVIDER = 'sendgrid';
    process.env.ENABLE_EMAIL_US = 'false';
    jest.resetModules();
    const { EmailServiceFactory } = require('../service');
    const svc = EmailServiceFactory();
    const res = await svc.send('a@b.com', 't', {});
    expect(res.success).toBe(true);
    expect(res.messageId).toBe('dry-run');
  });
});
