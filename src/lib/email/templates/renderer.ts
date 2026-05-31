/**
 * Email template renderer
 * Replaces {{placeholder}} syntax with provided values
 */

export interface TemplateData {
  [key: string]: string | number | boolean | null | undefined;
}

/**
 * Renders a template string by replacing {{placeholder}} with values from data object
 * @param template - The template string with {{placeholder}} syntax
 * @param data - Object containing placeholder values
 * @returns Rendered string with placeholders replaced
 */
export function renderTemplate(template: string, data: TemplateData): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, placeholder) => {
    const value = data[placeholder];
    
    // Handle null/undefined values
    if (value === null || value === undefined) {
      console.warn(`Template placeholder "{{${placeholder}}}" not found in data`);
      return match; // Return original placeholder if value not found
    }
    
    return String(value);
  });
}

/**
 * Renders multiple templates with the same data
 * @param templates - Object with template names as keys and template strings as values
 * @param data - Object containing placeholder values
 * @returns Object with same keys, but rendered strings as values
 */
export function renderTemplates(
  templates: Record<string, string>,
  data: TemplateData
): Record<string, string> {
  const rendered: Record<string, string> = {};
  
  for (const [name, template] of Object.entries(templates)) {
    rendered[name] = renderTemplate(template, data);
  }
  
  return rendered;
}

/**
 * Loads and renders a template file
 * Note: This is intended for use with dynamic imports or in Node.js environments
 * For browser environments, templates should be imported as strings or loaded via API
 */
export async function loadAndRenderTemplate(
  templatePath: string,
  data: TemplateData
): Promise<string> {
  try {
    // For Node.js/server-side use
    const template = await import(templatePath);
    const templateString = typeof template.default === 'string' ? template.default : template.toString();
    return renderTemplate(templateString, data);
  } catch (error) {
    throw new Error(`Failed to load template from ${templatePath}: ${error}`);
  }
}
