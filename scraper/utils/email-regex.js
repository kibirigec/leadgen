// Exact regexes specified in TASK.md
export const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
export const PHONE_REGEX = /(?:\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/g;

export const INVALID_EMAIL_DOMAINS = [
  'example.com',
  'test.com',
  'domain.com',
  'email.com',
  'yourname.com',
  'sentry.io',
  'sampleemail'
];

export const INVALID_EMAIL_LOCAL_PATTERNS = [
  /^photo@\d+x$/i,
  /^image@\d+x$/i
];

/**
 * Validates an extracted email against the reject lists.
 */
export function isValidEmail(email) {
  if (!email) return false;
  const parts = email.toLowerCase().split('@');
  if (parts.length !== 2) return false;
  
  const [localPart, domain] = parts;
  
  if (INVALID_EMAIL_DOMAINS.includes(domain)) return false;
  
  for (const pattern of INVALID_EMAIL_LOCAL_PATTERNS) {
    if (pattern.test(`${localPart}@${domain}`)) return false; // The rule says local part is an image filename pattern e.g. photo@2x, wait, the example was `photo@2x`, so it includes the @ inside the local part? No, usually it's `photo@2x.jpg` or `photo` @ `2x.com`. Let's assume the local part is `photo` and domain is `2x...`. The rule says: "where the local part is an image filename pattern (e.g. photo@2x, image@1x)". Wait, `photo@2x` is usually an image name for retina displays, not an email, but the regex catches it as an email. So the full string is `photo@2x` ... wait, `2x` is not a valid TLD unless it's `2x.png`. The regex matches `photo@2x.png` as an email. 
    // I will check if the full string matches the pattern:
  }
  
  // Actually, let's just check if the email string looks like a file name
  if (/(photo|image)@\d+x/i.test(email)) return false;
  if (email.includes('sentry.io')) return false;

  return true;
}
