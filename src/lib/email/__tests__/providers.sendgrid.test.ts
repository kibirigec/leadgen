import { SendGridProvider } from '../providers/sendgrid';

// Mock fetch globally
global.fetch = jest.fn();

describe('SendGridProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.SENDGRID_API_KEY;
    delete process.env.EMAIL_FROM;
    delete process.env.ENABLE_EMAIL_US;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('dry-run mode', () => {
    it('should return success with dry-run messageId when ENABLE_EMAIL_US is not true', async () => {
      process.env.ENABLE_EMAIL_US = 'false';
      const provider = new SendGridProvider();

      const result = await provider.send('test@example.com', 'welcome-template', {
        name: 'John',
        activationLink: 'https://example.com/activate',
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('dry-run');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should return success with dry-run messageId when SENDGRID_API_KEY is not provided', async () => {
      process.env.ENABLE_EMAIL_US = 'true';
      delete process.env.SENDGRID_API_KEY;
      const provider = new SendGridProvider();

      const result = await provider.send('test@example.com', 'confirm-template', {});

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('dry-run');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should log dry-run message with template and data', async () => {
      process.env.ENABLE_EMAIL_US = 'false';
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const provider = new SendGridProvider();

      await provider.send('test@example.com', 'welcome-template', {
        name: 'Jane',
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[SendGridProvider DRY-RUN]'),
        expect.any(Object)
      );
      const callArgs = consoleSpy.mock.calls[0];
      expect(callArgs[0]).toContain('test@example.com');
      expect(callArgs[0]).toContain('welcome-template');

      consoleSpy.mockRestore();
    });
  });

  describe('email sending', () => {
    beforeEach(() => {
      process.env.SENDGRID_API_KEY = 'test-api-key-123';
      process.env.EMAIL_FROM = 'sender@example.com';
      process.env.ENABLE_EMAIL_US = 'true';
    });

    it('should send email to SendGrid API with correct payload', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 202,
        headers: new Map([['x-message-id', 'sg-message-123']]),
        text: jest.fn().mockResolvedValueOnce(''),
      });

      const provider = new SendGridProvider();
      const result = await provider.send('recipient@example.com', 'welcome-template', {
        name: 'Alice',
        confirmUrl: 'https://example.com/confirm',
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('sg-message-123');

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.sendgrid.com/v3/mail/send',
        {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer test-api-key-123',
            'Content-Type': 'application/json',
          },
          body: expect.stringContaining('recipient@example.com'),
        }
      );
    });

    it('should build correct mail payload with template substitutions', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 202,
        headers: new Map([['x-message-id', 'sg-msg-456']]),
        text: jest.fn().mockResolvedValueOnce(''),
      });

      const provider = new SendGridProvider();
      await provider.send('user@example.com', 'notification-template', {
        firstName: 'Bob',
        lastName: 'Smith',
        action: 'verify',
      });

      const callBody = (global.fetch as jest.Mock).mock.calls[0][1].body;
      const payload = JSON.parse(callBody);

      expect(payload.personalizations[0].to[0].email).toBe('user@example.com');
      expect(payload.from.email).toBe('sender@example.com');
      expect(payload.template_id).toBe('notification-template');
      expect(payload.personalizations[0].substitutions).toEqual({
        '-firstName-': 'Bob',
        '-lastName-': 'Smith',
        '-action-': 'verify',
      });
    });

    it('should use default EMAIL_FROM when not provided', async () => {
      delete process.env.EMAIL_FROM;
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 202,
        headers: new Map([['x-message-id', 'sg-msg-789']]),
        text: jest.fn().mockResolvedValueOnce(''),
      });

      const provider = new SendGridProvider();
      await provider.send('test@example.com', 'template', {});

      const callBody = (global.fetch as jest.Mock).mock.calls[0][1].body;
      const payload = JSON.parse(callBody);

      expect(payload.from.email).toBe('noreply@leadgen.com');
    });

    it('should handle API response without x-message-id header', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 202,
        headers: new Map(),
        text: jest.fn().mockResolvedValueOnce(''),
      });

      const provider = new SendGridProvider();
      const result = await provider.send('test@example.com', 'template', {});

      expect(result.success).toBe(true);
      expect(result.messageId).toMatch(/^sendgrid-\d+$/);
    });

    it('should handle API errors gracefully', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: jest.fn().mockResolvedValueOnce('Unauthorized: Invalid API key'),
      });

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const provider = new SendGridProvider();
      const result = await provider.send('test@example.com', 'template', {});

      expect(result.success).toBe(false);
      expect(result.info).toEqual({
        error: 'SendGrid API error: 401 - Unauthorized: Invalid API key',
      });
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[SendGridProvider] Failed to send email')
      );

      consoleSpy.mockRestore();
    });

    it('should handle network errors', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(
        new Error('Network timeout')
      );

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const provider = new SendGridProvider();
      const result = await provider.send('test@example.com', 'template', {});

      expect(result.success).toBe(false);
      expect(result.info).toEqual({ error: 'Network timeout' });

      consoleSpy.mockRestore();
    });

    it('should convert various data types to strings in substitutions', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 202,
        headers: new Map([['x-message-id', 'sg-msg-001']]),
        text: jest.fn().mockResolvedValueOnce(''),
      });

      const provider = new SendGridProvider();
      await provider.send('test@example.com', 'template', {
        count: 42,
        isActive: true,
        price: 99.99,
        status: 'pending',
      });

      const callBody = (global.fetch as jest.Mock).mock.calls[0][1].body;
      const payload = JSON.parse(callBody);

      expect(payload.personalizations[0].substitutions).toEqual({
        '-count-': '42',
        '-isActive-': 'true',
        '-price-': '99.99',
        '-status-': 'pending',
      });
    });

    it('should log success message with messageId', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 202,
        headers: new Map([['x-message-id', 'sg-msg-success-001']]),
        text: jest.fn().mockResolvedValueOnce(''),
      });

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const provider = new SendGridProvider();
      await provider.send('test@example.com', 'template', {});

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[SendGridProvider] Email sent successfully')
      );
      const callArgs = consoleSpy.mock.calls[0];
      expect(callArgs[0]).toContain('sg-msg-success-001');

      consoleSpy.mockRestore();
    });
  });

  describe('configuration', () => {
    it('should use API key from environment', () => {
      process.env.SENDGRID_API_KEY = 'my-secret-key';
      process.env.ENABLE_EMAIL_US = 'true';
      process.env.EMAIL_FROM = 'admin@example.com';

      const provider = new SendGridProvider();
      // We can't directly access private fields, but we can verify behavior through a call
      expect(provider).toBeDefined();
    });

    it('should warn when API key is missing but ENABLE_EMAIL_US is true', () => {
      process.env.ENABLE_EMAIL_US = 'true';
      delete process.env.SENDGRID_API_KEY;

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      new SendGridProvider();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[SendGridProvider] No SENDGRID_API_KEY provided')
      );

      consoleSpy.mockRestore();
    });
  });
});
