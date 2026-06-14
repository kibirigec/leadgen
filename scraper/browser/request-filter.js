/**
 * Blocks unnecessary resource types to speed up scraping and reduce detection footprint.
 * 
 * @param {boolean} allowStylesheets - Some platforms (Facebook/Instagram) need stylesheets to render content.
 */
export async function setupRequestFilter(page, allowStylesheets = false) {
  await page.route('**/*', route => {
    const request = route.request();
    const type = request.resourceType();
    
    // Always block images, media, fonts
    if (['image', 'media', 'font'].includes(type)) {
      return route.abort();
    }
    
    // Conditionally block stylesheets
    if (type === 'stylesheet' && !allowStylesheets) {
      return route.abort();
    }
    
    return route.continue();
  });
}
