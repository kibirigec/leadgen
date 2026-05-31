# Email Templates

This directory contains email templates for the LeadGen application. Templates are organized by locale and use a simple `{{placeholder}}` syntax for dynamic content injection.

## Directory Structure

```
templates/
├── README.md              # This file
├── renderer.ts            # Template rendering utility
├── welcome_us.html        # HTML welcome email template (US locale)
└── welcome_us.txt         # Plain text welcome email template (US locale)
```

## Template Syntax

Templates use `{{placeholder}}` syntax for variable substitution. The renderer will replace these with values from a data object.

Example:
```html
<p>Hello {{name}}, welcome to {{brandName}}!</p>
```

With data: `{ name: "John", brandName: "LeadGen" }`

Result:
```html
<p>Hello John, welcome to LeadGen!</p>
```

## Adding New Templates

To add a new template:

1. **Create the template file** in this directory with a descriptive name:
   - For HTML: `template_name_locale.html` (e.g., `reset_password_us.html`)
   - For plain text: `template_name_locale.txt` (e.g., `reset_password_us.txt`)

2. **Use {{placeholder}} syntax** for all dynamic content

3. **Common placeholders** across templates:
   - `{{name}}` - User's name
   - `{{email}}` - User's email address
   - `{{brandName}}` - Application/company name
   - `{{currentYear}}` - Current year (for copyright)
   - `{{supportEmail}}` - Support email address
   - `{{dashboardUrl}}` - Link to user dashboard

4. **Template-specific placeholders**:
   - Define custom placeholders as needed in your template
   - Document them in comments within the template file

## Using Templates in Code

Import and use the renderer utility:

```typescript
import { renderTemplate } from '@/lib/email/templates/renderer';
import welcomeTemplate from '@/lib/email/templates/welcome_us.html?raw';

const rendered = renderTemplate(welcomeTemplate, {
  name: 'John Doe',
  email: 'john@example.com',
  brandName: 'LeadGen',
  createdDate: new Date().toLocaleDateString(),
  referralCode: 'ABC123',
  dashboardUrl: 'https://example.com/dashboard',
  supportEmail: 'support@example.com',
  currentYear: new Date().getFullYear(),
});
```

## Best Practices

- **Keep templates simple**: Avoid complex logic in templates
- **Use consistent naming**: Follow the `purpose_locale.ext` pattern
- **Provide defaults**: Always have fallback text for missing placeholders
- **Test with real data**: Test templates with actual data before deploying
- **Maintain locale variants**: Create locale-specific versions (e.g., `_us`, `_uk`) as needed
- **Document custom placeholders**: Add comments in templates for non-standard placeholders
- **Separate concerns**: Keep HTML and plain text versions synchronized

## Locale Conventions

Templates follow locale suffixes:
- `_us` - United States English
- `_uk` - British English
- `_es` - Spanish
- `_fr` - French
- etc.

Add new locales as the application expands to new markets.
