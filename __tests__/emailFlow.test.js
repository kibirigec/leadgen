const regionFilter = (recipients) => recipients.filter(r => r.region === 'US');
const renderTemplate = (template, data) => template.replace(/{{\s*(\w+)\s*}}/g, (_, k) => data[k] || '');

class DryQueue {
  constructor() { this.queue = []; }
  enqueue(item) { this.queue.push(item); }
  drain() { const items = [...this.queue]; this.queue = []; return items; }
}

class SendGridProvider {
  constructor({dryRun = true, rateLimit = 10} = {}) {
    this.dryRun = dryRun;
    this.sent = [];
    this.rateLimit = rateLimit;
  }
  async send(mail) {
    if (this.dryRun) {
      // simulate network delay respecting rate limit
      this.sent.push({mail, dryRun: true});
      return {accepted: true, id: 'dry-run'};
    }
    // In real mode you'd call SendGrid API here.
    this.sent.push({mail, dryRun: false});
    return {accepted: true, id: 'real-send'};
  }
}

test('end-to-end US-only email flow in dry-run', async () => {
  const recipients = [
    {email: 'alice@us.com', name: 'Alice', region: 'US'},
    {email: 'bob@ca.com', name: 'Bob', region: 'CA'},
    {email: 'carol@us.com', name: 'Carol', region: 'US'},
  ];

  // 1) filter
  const filtered = regionFilter(recipients);
  expect(filtered.length).toBe(2);
  expect(filtered.map(r => r.email)).toEqual(['alice@us.com','carol@us.com']);

  // 2) render
  const template = 'Hello {{ name }}, welcome to our US program.';
  const rendered = filtered.map(r => ({to: r.email, body: renderTemplate(template, {name: r.name})}));
  expect(rendered[0].body).toContain('Alice');

  // 3) queue
  const queue = new DryQueue();
  rendered.forEach(m => queue.enqueue(m));
  expect(queue.queue.length).toBe(2);

  // 4) provider dry-run
  const provider = new SendGridProvider({dryRun: true, rateLimit: 5});
  const items = queue.drain();
  for (const item of items) {
    const res = await provider.send(item);
    expect(res.accepted).toBe(true);
  }
  expect(provider.sent.length).toBe(2);
  expect(provider.sent[0].dryRun).toBe(true);
});
