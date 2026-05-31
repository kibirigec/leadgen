import {
  isRecipientUS,
  filterUSOnly,
  clearIPCache,
  getIPCacheSize,
  Recipient,
} from '../region';

// Mock fetch globally
global.fetch = jest.fn();

describe('Region Filter - isRecipientUS', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearIPCache();
  });

  describe('Direct country field', () => {
    it('returns true for US country (uppercase)', async () => {
      const recipient: Recipient = { country: 'US', email: 'test@example.com' };
      const result = await isRecipientUS(recipient);
      expect(result).toBe(true);
    });

    it('returns true for US country (lowercase)', async () => {
      const recipient: Recipient = { country: 'us', email: 'test@example.com' };
      const result = await isRecipientUS(recipient);
      expect(result).toBe(true);
    });

    it('returns true for US country (mixed case)', async () => {
      const recipient: Recipient = { country: 'Us', email: 'test@example.com' };
      const result = await isRecipientUS(recipient);
      expect(result).toBe(true);
    });

    it('returns false for non-US country', async () => {
      const recipient: Recipient = { country: 'CA', email: 'test@example.com' };
      const result = await isRecipientUS(recipient);
      expect(result).toBe(false);
    });

    it('returns false for non-US country (lowercase)', async () => {
      const recipient: Recipient = { country: 'gb', email: 'test@example.com' };
      const result = await isRecipientUS(recipient);
      expect(result).toBe(false);
    });
  });

  describe('Metadata country field', () => {
    it('returns true for metadata.country = US', async () => {
      const recipient: Recipient = {
        metadata: { country: 'US' },
        email: 'test@example.com',
      };
      const result = await isRecipientUS(recipient);
      expect(result).toBe(true);
    });

    it('returns true for metadata.country = us (lowercase)', async () => {
      const recipient: Recipient = {
        metadata: { country: 'us' },
        email: 'test@example.com',
      };
      const result = await isRecipientUS(recipient);
      expect(result).toBe(true);
    });

    it('returns false for non-US metadata.country', async () => {
      const recipient: Recipient = {
        metadata: { country: 'MX' },
        email: 'test@example.com',
      };
      const result = await isRecipientUS(recipient);
      expect(result).toBe(false);
    });

    it('prefers direct country field over metadata', async () => {
      const recipient: Recipient = {
        country: 'CA',
        metadata: { country: 'US' },
        email: 'test@example.com',
      };
      const result = await isRecipientUS(recipient);
      expect(result).toBe(false);
    });
  });

  describe('Metadata region field', () => {
    it('returns true for metadata.region = US', async () => {
      const recipient: Recipient = {
        metadata: { region: 'US' },
        email: 'test@example.com',
      };
      const result = await isRecipientUS(recipient);
      expect(result).toBe(true);
    });

    it('returns true for metadata.region = us (lowercase)', async () => {
      const recipient: Recipient = {
        metadata: { region: 'us' },
        email: 'test@example.com',
      };
      const result = await isRecipientUS(recipient);
      expect(result).toBe(true);
    });

    it('returns false for non-US metadata.region', async () => {
      const recipient: Recipient = {
        metadata: { region: 'EU' },
        email: 'test@example.com',
      };
      const result = await isRecipientUS(recipient);
      expect(result).toBe(false);
    });

    it('prefers metadata.country over metadata.region', async () => {
      const recipient: Recipient = {
        metadata: { country: 'CA', region: 'US' },
        email: 'test@example.com',
      };
      const result = await isRecipientUS(recipient);
      expect(result).toBe(false);
    });
  });

  describe('IP lookup via ipinfo.io', () => {
    it('returns true for US IP address', async () => {
      const mockFetch = global.fetch as jest.Mock;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ country: 'US', ip: '8.8.8.8' }),
      });

      const recipient: Recipient = { ip: '8.8.8.8', email: 'test@example.com' };
      const result = await isRecipientUS(recipient);

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith('https://ipinfo.io/8.8.8.8/json', {
        signal: expect.any(AbortSignal),
      });
    });

    it('returns false for non-US IP address', async () => {
      const mockFetch = global.fetch as jest.Mock;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ country: 'GB', ip: '1.2.3.4' }),
      });

      const recipient: Recipient = { ip: '1.2.3.4', email: 'test@example.com' };
      const result = await isRecipientUS(recipient);

      expect(result).toBe(false);
    });

    it('returns false when IP lookup fails', async () => {
      const mockFetch = global.fetch as jest.Mock;
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({}),
      });

      const recipient: Recipient = { ip: '1.2.3.4', email: 'test@example.com' };
      const result = await isRecipientUS(recipient);

      expect(result).toBe(false);
    });

    it('handles timeout when IP lookup takes too long', async () => {
      const mockFetch = global.fetch as jest.Mock;
      mockFetch.mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            setTimeout(
              () => reject(new Error('AbortError')),
              100
            );
          })
      );

      const recipient: Recipient = { ip: '1.2.3.4', email: 'test@example.com' };
      const result = await isRecipientUS(recipient);

      expect(result).toBe(false);
    });

    it('caches IP lookup results', async () => {
      const mockFetch = global.fetch as jest.Mock;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ country: 'US', ip: '8.8.8.8' }),
      });

      const recipient: Recipient = { ip: '8.8.8.8', email: 'test@example.com' };

      // First call should hit the API
      const result1 = await isRecipientUS(recipient);
      expect(result1).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Second call should use cache
      const result2 = await isRecipientUS(recipient);
      expect(result2).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1); // Still 1, not 2
    });

    it('prefers direct country field over IP lookup', async () => {
      const mockFetch = global.fetch as jest.Mock;

      const recipient: Recipient = {
        country: 'CA',
        ip: '8.8.8.8',
        email: 'test@example.com',
      };
      const result = await isRecipientUS(recipient);

      expect(result).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled(); // Should not call API
    });

    it('prefers metadata over IP lookup', async () => {
      const mockFetch = global.fetch as jest.Mock;

      const recipient: Recipient = {
        metadata: { country: 'MX' },
        ip: '8.8.8.8',
        email: 'test@example.com',
      };
      const result = await isRecipientUS(recipient);

      expect(result).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled(); // Should not call API
    });

    it('handles empty country in IP response', async () => {
      const mockFetch = global.fetch as jest.Mock;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ip: '1.2.3.4' }), // No country field
      });

      const recipient: Recipient = { ip: '1.2.3.4', email: 'test@example.com' };
      const result = await isRecipientUS(recipient);

      expect(result).toBe(false);
    });
  });

  describe('Edge cases', () => {
    it('returns false for null recipient', async () => {
      const result = await isRecipientUS(null as any);
      expect(result).toBe(false);
    });

    it('returns false for undefined recipient', async () => {
      const result = await isRecipientUS(undefined as any);
      expect(result).toBe(false);
    });

    it('returns false for empty recipient object', async () => {
      const recipient: Recipient = {};
      const result = await isRecipientUS(recipient);
      expect(result).toBe(false);
    });

    it('returns false when only email is provided', async () => {
      const recipient: Recipient = { email: 'test@example.com' };
      const result = await isRecipientUS(recipient);
      expect(result).toBe(false);
    });

    it('handles metadata with other fields', async () => {
      const recipient: Recipient = {
        metadata: {
          country: 'US',
          city: 'New York',
          state: 'NY',
          extra: { nested: 'value' },
        },
        email: 'test@example.com',
      };
      const result = await isRecipientUS(recipient);
      expect(result).toBe(true);
    });
  });

  describe('Cache management', () => {
    it('clears IP cache with clearIPCache()', async () => {
      const mockFetch = global.fetch as jest.Mock;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ country: 'US', ip: '8.8.8.8' }),
      });

      const recipient: Recipient = { ip: '8.8.8.8', email: 'test@example.com' };
      await isRecipientUS(recipient);

      expect(getIPCacheSize()).toBe(1);
      clearIPCache();
      expect(getIPCacheSize()).toBe(0);
    });

    it('tracks cache size correctly', async () => {
      const mockFetch = global.fetch as jest.Mock;
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ country: 'US', ip: '8.8.8.8' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ country: 'CA', ip: '1.2.3.4' }),
        });

      await isRecipientUS({ ip: '8.8.8.8' });
      expect(getIPCacheSize()).toBe(1);

      await isRecipientUS({ ip: '1.2.3.4' });
      expect(getIPCacheSize()).toBe(2);
    });
  });
});

describe('Region Filter - filterUSOnly', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearIPCache();
  });

  it('filters array to only US recipients', async () => {
    const recipients: Recipient[] = [
      { country: 'US', email: 'us1@example.com' },
      { country: 'CA', email: 'ca@example.com' },
      { country: 'US', email: 'us2@example.com' },
    ];

    const result = await filterUSOnly(recipients);
    expect(result).toHaveLength(2);
    expect(result[0].email).toBe('us1@example.com');
    expect(result[1].email).toBe('us2@example.com');
  });

  it('handles empty array', async () => {
    const recipients: Recipient[] = [];
    const result = await filterUSOnly(recipients);
    expect(result).toEqual([]);
  });

  it('returns empty array for all non-US recipients', async () => {
    const recipients: Recipient[] = [
      { country: 'CA', email: 'ca@example.com' },
      { country: 'MX', email: 'mx@example.com' },
    ];

    const result = await filterUSOnly(recipients);
    expect(result).toEqual([]);
  });

  it('returns all recipients if all are US', async () => {
    const recipients: Recipient[] = [
      { country: 'US', email: 'us1@example.com' },
      { country: 'US', email: 'us2@example.com' },
    ];

    const result = await filterUSOnly(recipients);
    expect(result).toHaveLength(2);
  });

  it('handles mixed detection methods', async () => {
    const mockFetch = global.fetch as jest.Mock;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ country: 'US' }),
    });

    const recipients: Recipient[] = [
      { country: 'US', email: 'direct@example.com' }, // Direct country
      { metadata: { country: 'US' }, email: 'metadata@example.com' }, // Metadata
      { ip: '8.8.8.8', email: 'ip@example.com' }, // IP lookup
      { country: 'CA', email: 'non-us@example.com' }, // Non-US
    ];

    const result = await filterUSOnly(recipients);
    expect(result).toHaveLength(3);
    expect(result.map((r) => r.email)).toEqual([
      'direct@example.com',
      'metadata@example.com',
      'ip@example.com',
    ]);
  });

  it('handles non-array input gracefully', async () => {
    const result = await filterUSOnly(null as any);
    expect(result).toEqual([]);
  });

  it('preserves recipient data during filtering', async () => {
    const recipients: Recipient[] = [
      {
        country: 'US',
        email: 'test@example.com',
        metadata: { name: 'John', age: 30 },
      },
      { country: 'CA', email: 'ca@example.com' },
    ];

    const result = await filterUSOnly(recipients);
    expect(result).toHaveLength(1);
    expect(result[0].metadata).toEqual({ name: 'John', age: 30 });
  });
});
