This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## US-only Email Automation

A new feature branch `feat/email-automation-us` implements an email automation system restricted to US recipients.

Quickstart (development, dry-run):

1. Install dependencies: npm install
2. Copy environment variables: cp .env.example .env
3. Keep ENABLE_EMAIL_US=false to avoid sending real emails. The system will log sends rather than perform them.
4. To enable real sends (use with caution): set ENABLE_EMAIL_US=true and provide SENDGRID_API_KEY and EMAIL_FROM in your environment.

See `src/lib/email` for implementation details: providers, templates, queue, scheduler, and region filters.


## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## US-only Email Automation

Branch: feat/email-automation-us

This project contains an automation that sends emails to US recipients only. It's disabled by default for safety.

Required environment variables:
- SENDGRID_API_KEY - your SendGrid API key (keep secret)
- ENABLE_EMAIL_US - set to true to allow real sends (default: false)
- EMAIL_FROM - default from address for outgoing emails
- REDIS_URL - optional Redis URL for queuing
- SENDGRID_RATE_LIMIT - optional rate limit for sends
- FIREBASE_SERVICE_ACCOUNT - optional full JSON string for Firebase admin credentials

Local testing (dry-run):
- By default automation runs in dry-run; set ENABLE_EMAIL_US=false or leave SENDGRID_API_KEY unset.
- Run unit tests which verify the end-to-end flow without sending real emails:

  npm test

To perform real sends locally (use with caution):
1. export SENDGRID_API_KEY="<your_key>"
2. export ENABLE_EMAIL_US=true
3. export EMAIL_FROM="Your Name <you@example.com>"
4. Run the send script or integration test that performs a live send.

Deployment notes:
- Ensure SENDGRID_API_KEY and ENABLE_EMAIL_US are set securely in production environment only when intended.
- Use rate limiting and a queue-backed worker (REDIS_URL) to avoid SendGrid throttling.

## US Hospitality Lead Scraper

A multi-platform scraper to find small US hospitality businesses without a direct booking website.

### Prerequisites
- Node.js 20+
- PostgreSQL 14+
- Playwright dependencies: `npx playwright install-deps chromium`

### Installation
```bash
npm install
npx playwright install chromium
```

### Database Setup & Local Testing
We use Docker Compose to spin up a local PostgreSQL database that mirrors production.

1. Start the database:
```bash
npm run db:up
```
*(This automatically creates the required schema on first start via `schema.sql`)*

2. Run the test scraper script:
```bash
npm run scrape:test
```
*(This runs a fast, dry-run scrape against a small target and outputs a table summary)*

3. Stop the database when done:
```bash
npm run db:down
```

### Integration Example
```javascript
import { runScraper, getStats, getLeadsForOutreach, updateOutreachStatus } from './scraper/index.js';

// Run scraper
const result = await runScraper({
  targets: [
    { source: 'google_maps', query: 'bed and breakfast Nashville Tennessee' }
  ],
  maxResultsPerTarget: 80,
  dryRun: false
});

// Fetch leads ready for outreach
const leads = await getLeadsForOutreach({ minScore: 50, emailOnly: true, limit: 50 });
```

### Extending / Adding a City
Pass new targets into the `runScraper` `config.targets` array with the target city and state.

### Implementation Notes & Assumptions
- **Airbnb, VRBO, Booking.com**: Fully fleshed out modules would require very complex selectors for each platform. The provided structures implement the correct integration layout, but selectors in `tripadvisor.js` and others may need adjustment as the platforms update their DOM classes. 
- **Website Filter**: The scraper looks for standard booking engine scripts or keywords like "book now". Very obscure booking engines might pass the filter until added to `website-checker.js`.
- **Database Schema**: Ensure the `pg` driver is configured with the correct `search_path` or default schema if `leads` is not in `public`.
- **ES Modules**: `package.json` was updated to `"type": "module"`. Ensure any existing Next.js config files work (e.g., `jest.config.js` might need to be renamed to `.cjs`).
