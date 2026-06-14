/**
 * Normalises a URL to a consistent format for comparison.
 */
export function normalizeUrl(urlStr) {
  if (!urlStr) return null;
  try {
    let urlString = urlStr.trim();
    if (!urlString.startsWith('http')) {
      urlString = 'https://' + urlString;
    }
    const url = new URL(urlString);
    
    // Remove common tracking parameters
    const paramsToRemove = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid'];
    for (const param of paramsToRemove) {
      url.searchParams.delete(param);
    }
    
    // Normalize hostname
    let hostname = url.hostname.toLowerCase();
    if (hostname.startsWith('www.')) {
      hostname = hostname.slice(4);
    }
    url.hostname = hostname;
    
    // Remove trailing slash
    let finalUrl = url.toString();
    if (finalUrl.endsWith('/')) {
      finalUrl = finalUrl.slice(0, -1);
    }
    
    return finalUrl;
  } catch (e) {
    return null; // Invalid URL
  }
}

/**
 * Extracts a base domain for fingerprinting.
 */
export function extractDomain(urlStr) {
  try {
    const norm = normalizeUrl(urlStr);
    if (!norm) return null;
    const url = new URL(norm);
    return url.hostname;
  } catch (e) {
    return null;
  }
}
