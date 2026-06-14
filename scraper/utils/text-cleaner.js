import * as cheerio from 'cheerio';

/**
 * Strips HTML and normalises whitespace from a string or HTML string.
 */
export function cleanText(htmlOrText) {
  if (!htmlOrText) return '';
  const $ = cheerio.load(htmlOrText);
  const text = $.text();
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Creates a slug for a string (lowercase, hyphenated, alphanumeric only).
 */
export function slugify(text) {
  if (!text) return '';
  return text
    .toString()
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
