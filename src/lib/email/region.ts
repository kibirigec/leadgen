/**
 * Region-based filtering for email recipients
 * Supports country detection via direct field, metadata, or IP lookup
 */

// In-memory cache for IP lookups to avoid repeated API calls
const ipCountryCache = new Map<string, string>();

// Timeout for ipinfo.io requests (milliseconds)
const IP_LOOKUP_TIMEOUT = 5000;

/**
 * Fetches country code for an IP address with timeout handling
 * Results are cached in memory for the process runtime
 */
async function getCountryFromIP(ip: string): Promise<string | null> {
  // Check cache first
  if (ipCountryCache.has(ip)) {
    return ipCountryCache.get(ip) || null;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), IP_LOOKUP_TIMEOUT);

    const response = await fetch(`https://ipinfo.io/${ip}/json`, {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      ipCountryCache.set(ip, '');
      return null;
    }

    const data = (await response.json()) as Record<string, unknown>;
    const country = (data.country as string | undefined) || '';

    // Cache the result
    ipCountryCache.set(ip, country);

    return country || null;
  } catch (error) {
    // Cache empty string on error to avoid repeated failed attempts
    ipCountryCache.set(ip, '');
    return null;
  }
}

/**
 * Recipient type with optional country, IP, email, and metadata fields
 */
export interface Recipient {
  email?: string;
  country?: string;
  ip?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Determines if a recipient is from the US
 * 
 * Detection logic (in order):
 * 1. If country field is present, check if it equals 'US' (case-insensitive)
 * 2. If missing, try to infer from metadata.country or metadata.region
 * 3. If still missing and ip is present, perform IP geolocation lookup via ipinfo.io
 * 
 * @param recipient - The recipient object to check
 * @returns true if the recipient is confirmed to be from the US, false otherwise
 */
export async function isRecipientUS(recipient: Recipient): Promise<boolean> {
  if (!recipient) {
    return false;
  }

  // Check direct country field first
  if (recipient.country) {
    return recipient.country.toUpperCase() === 'US';
  }

  // Try to infer from metadata
  if (recipient.metadata) {
    const metadataCountry = recipient.metadata.country as string | undefined;
    if (metadataCountry) {
      return metadataCountry.toUpperCase() === 'US';
    }

    const metadataRegion = recipient.metadata.region as string | undefined;
    if (metadataRegion) {
      return metadataRegion.toUpperCase() === 'US';
    }
  }

  // Try IP lookup if available
  if (recipient.ip) {
    const country = await getCountryFromIP(recipient.ip);
    if (country) {
      return country.toUpperCase() === 'US';
    }
  }

  return false;
}

/**
 * Filters an array of recipients to only include those from the US
 * 
 * @param recipients - Array of recipient objects to filter
 * @returns Array containing only US recipients
 */
export async function filterUSOnly(recipients: Recipient[]): Promise<Recipient[]> {
  if (!Array.isArray(recipients)) {
    return [];
  }

  const results = await Promise.all(
    recipients.map(async (recipient) => ({
      isUS: await isRecipientUS(recipient),
      recipient,
    }))
  );

  return results.filter(({ isUS }) => isUS).map(({ recipient }) => recipient);
}

/**
 * Clears the IP lookup cache (useful for testing)
 */
export function clearIPCache(): void {
  ipCountryCache.clear();
}

/**
 * Gets the current size of the IP cache (useful for testing/debugging)
 */
export function getIPCacheSize(): number {
  return ipCountryCache.size;
}
