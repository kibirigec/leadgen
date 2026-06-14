# LeadGen Project Overview

LeadGen is a lead generation and outreach platform with three major systems: a Next.js web app (dashboard and APIs), a worker service (scrape + WhatsApp dispatch + cron scheduling), and a standalone hospitality scraper (Playwright + Postgres). It supports two outreach markets (UG and US), uses Firebase/Firestore for live operations, and includes a US-only email automation module.

## Architecture at a glance

| Layer | Purpose | Tech |
|---|---|---|
| Web app | UI, server actions, cron endpoints | Next.js App Router, React 19, TypeScript, Tailwind |
| Worker | WhatsApp automation, scraping, cron scheduling | Express, node-cron, Puppeteer, Firebase Admin |
| Scraper | Multi-platform hospitality lead pipeline | Playwright, axios/cheerio, pg, p-queue |
| Email automation | US-only email queue and scheduler | SendGrid (or mock), in-memory/Redis queue |
| Data | Live ops and queues | Firestore (primary), Postgres (scraper DB) |

## Key directories

| Path | Notes |
|---|---|
| `src/app` | Next.js pages and API routes (cron, test endpoints) |
| `src/components` | Dashboard, leads list, monitor UI |
| `src/actions` | Server actions for leads + bot settings |
| `src/lib` | Firebase, Apify, scrape cron, WhatsApp template sender, email module |
| `worker/` | Express worker service, cron schedules, bot automation |
| `scraper/` | Standalone hospitality scraper pipeline and Postgres access |
| `shared/` | Cross-service types and phone utilities |
| `docs/` | Operational guides (e.g., Apify scheduler setup) |

## Primary data (Firestore)

- `leads`: saved leads from UI searches
- `leads_queue` / `leads_queue_US`: daily dispatch queue
- `reserve_pool`: excess leads used to backfill queues
- `rotation_tracker`: keyword/city cooldown tracking
- `leads_raw`: audit trail of scraped leads
- `system/settings`: runtime configuration (cron times, market toggles, test mode)
- `system/bot_status` and `system/bot_logs`: live status + logs for the monitor UI
- `system/scrape_state`: last scrape summary

## Main flows

1. **Manual lead search (UI)**  
   The web app calls Apify (Google Maps) and saves leads into Firestore for review and outreach.

2. **Daily scrape (cron)**  
   The cron endpoint (`/api/cron/scrape`) runs `src/lib/scrape-cron.ts` to pull leads, apply rotation rules, dedupe by phone, and fill the queue + reserve pool.

3. **Dispatch windows (worker)**  
   The worker detects the current window, fetches pending leads (fresh, backlog, reserve), runs the WhatsApp bot, and updates Firestore status/logs for realtime monitoring.

4. **US-only email automation**  
   Email sends are gated by `ENABLE_EMAIL_US` and use SendGrid (or mock) with a rate-limited queue.

## Markets

- **UG**: EAT time windows, Uganda-focused keyword/city rotations.
- **US**: UTC windows, separate queues and bot status docs.

## Scripts

From `package.json` at repo root:

- `npm run dev` - Next.js dev server  
- `npm run build` / `npm run start`  
- `npm run lint`  
- `npm test`  
- `npm run db:up` / `npm run db:down`  
- `npm run scrape:test` (scraper dry-run)

Worker scripts (`worker/package.json`):

- `npm run dev` - watch worker
- `npm run build` / `npm run start`  

## Environment configuration

All required variables are documented in `.env.example`. Sensitive values (Firebase admin key, WhatsApp token, SendGrid key, etc.) must be provided via environment variables and should never be committed.

## Deployment notes

- The web app can be deployed on Vercel or a VPS.  
- The worker should run as a long-lived process (PM2 or system service) with access to the same Firestore project.  
- For WhatsApp automation, the worker uses Puppeteer with a persisted session directory (`WWEB_SESSION_PATH`).  

## Hospitality scraper (standalone)

The `/scraper` directory is a separate pipeline that:

- Scrapes multiple platforms (Google Maps, TripAdvisor, Airbnb, VRBO, Booking.com)
- Enriches and filters leads (website checks, email hunting)
- Writes to Postgres with dedup + scoring

It is independent from the Firebase-driven workflows above.
