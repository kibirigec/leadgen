/**
 * Normalises a US phone number to E.164 format: +1XXXXXXXXXX
 * Rejects numbers with <10 digits or non-US area codes.
 */
export function normalizePhone(phoneStr) {
  if (!phoneStr) return null;
  
  // Strip all non-digit characters
  const digits = phoneStr.replace(/\D/g, '');
  
  if (digits.length < 10) return null;
  
  let normalized = digits;
  
  // If 11 digits and starts with 1, it's a US country code
  if (digits.length === 11) {
    if (digits.startsWith('1')) {
      normalized = digits.slice(1);
    } else {
      return null; // Not a US number (or invalid)
    }
  } else if (digits.length > 11) {
    // If >11 digits, could have an extension.
    // For our purposes, just take the first 10 if it doesn't start with country code.
    // Actually, just reject if it's too long to be safe, or just take first 10.
    if (digits.startsWith('1')) {
      normalized = digits.slice(1, 11);
    } else {
      normalized = digits.slice(0, 10);
    }
  }

  // Basic validation of area code (cannot start with 0 or 1)
  const areaCode = normalized.slice(0, 3);
  if (areaCode.startsWith('0') || areaCode.startsWith('1')) {
    return null;
  }
  
  return `+1${normalized}`;
}
