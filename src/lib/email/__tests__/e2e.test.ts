import { EmailService } from '../service';
import { filterUSOnly } from '../region';
import { renderTemplate } from '../templates/renderer';
import { getQueue, resetQueue } from '../queue';

jest.setTimeout(10000);

test('end-to-end dry-run send for US recipients', async () => {
  const recipients = [
    { email: 'us1@example.com', country: 'US', name: 'User One' },
    { email: 'uk1@example.com', country: 'UK', name: 'User Two' }
  ];

  const usRecipients = await filterUSOnly(recipients as any);
  expect(usRecipients.length).toBe(1);

  const fs = require('fs');
  const path = require('path');
  const templatePath = path.join(__dirname, '..', 'templates', 'welcome_us.html');
  const templateStr = fs.readFileSync(templatePath, 'utf8');
  const html = renderTemplate(templateStr, { name: 'User One', brandName: 'LeadGen' });
  expect(html).toContain('LeadGen');

  const queue = getQueue();
  // ensure fresh instance for test
  if ((queue as any).reset) {
    resetQueue();
  }
  await queue.enqueue(usRecipients[0] as any, 'welcome_us' as any, { name: 'User One' });
  const size = await queue.getQueueSize();
  expect(size).toBeGreaterThanOrEqual(1);

  // simulate processor in dry-run
  process.env.ENABLE_EMAIL_US = 'false';
  const job = await queue.processNext();

  expect(job).toBeDefined();
});
