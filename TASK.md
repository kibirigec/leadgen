# AGENT PROMPT: Hospitality Lead Scraper — US Market
# Target: Drop this into Claude Code / Cursor / any agentic coding tool as your task prompt.
# Do not ask for clarification. Make reasonable decisions and document them in README.md.

---

## MISSION

Build a production-grade, multi-platform lead scraper that hunts for small US hospitality
businesses (B&Bs, guesthouses, boutique hotels, short-term rental hosts) that have NO
standalone website or have a severely outdated/thin one. The end goal is a clean PostgreSQL
database of qualified leads — each with contact details — ready for cold email and WhatsApp
outreach campaigns.

This is a revenue-critical tool. Every lead it misses is money left on the table.
Every bad lead it includes wastes outreach time. Accuracy and filtering discipline
are the top priorities, above speed.

---

## BUSINESS CONTEXT (read this, it shapes every decision)

The operator of this scraper sells direct booking websites to small accommodation businesses.
The ideal customer:
- Runs a B&B, guesthouse, boutique hotel, or manages 2+ short-term rental properties
- Is listed on Airbnb, VRBO, Booking.com, and/or TripAdvisor
- Has NO standalone direct booking website, or one that is clearly broken/outdated
- Is US-based
- Is reachable by email or WhatsApp/phone

A business WITH a modern direct booking website is NOT a lead.
A business with only a Facebook page or only a platform listing IS a lead.
A business on 3 platforms with no website of their own is a HOT lead — flag it.

---

## TECHNOLOGY STACK

- **Runtime**: Node.js 20+ (ESM modules — use `"type": "module"` in package.json)
- **Browser automation**: `playwright` + `playwright-extra` + `@extra/stealth` plugin
- **HTTP client**: `axios` with `axios-retry` for resilient fetching
- **HTML parsing**: `cheerio`
- **Database**: `pg` (node-postgres) — raw parameterised SQL only, no ORM
- **Queue management**: `p-queue` — controls concurrency, prevents hammering targets
- **Config**: `dotenv`
- **Logging**: `pino` — structured JSON logs, respects LOG_LEVEL env var
- **Validation**: `zod` — validate all scraped objects before DB insert
- **Scheduling**: Do NOT build a scheduler. Export functions the parent system calls.

Do NOT use Puppeteer. Do NOT use any paid scraping API. Do NOT use Google Places API.
Do NOT use any SaaS. Everything runs locally on a Linux VPS.

---

## PROJECT STRUCTURE

Place the entire scraper under `/scraper` inside the existing Node.js project root.
The existing project must be able to import from `./scraper/index.js` and nothing else.

```
/scraper
│
├── index.js                  ← Master export. Exposes runScraper(config) and getStats()
│
├── config.js                 ← Loads, validates, and exports all env vars via zod
│
├── db/
│   ├── pool.js               ← pg Pool singleton — one connection pool for the whole scraper
│   ├── schema.sql            ← Full table + index definitions. Run once to set up DB.
│   ├── leads.js              ← All lead CRUD operations (upsert, query, mark status)
│   └── migrations/
│       └── 001_initial.sql   ← Same as schema.sql but versioned for future changes
│
├── browser/
│   ├── launcher.js           ← Launches stealth Playwright browser, manages lifecycle
│   ├── page-factory.js       ← Creates fresh pages with shared anti-detection settings
│   └── request-filter.js     ← Blocks images/fonts/media to speed up + reduce fingerprint
│
├── scrapers/
│   ├── google-maps.js        ← Scrapes Google Maps search results for B&Bs and guesthouses
│   ├── tripadvisor.js        ← Scrapes TripAdvisor property listings and contact info
│   ├── airbnb.js             ← Scrapes Airbnb host profiles (multi-listing hosts only)
│   ├── vrbo.js               ← Scrapes VRBO property listings and host info
│   └── booking-com.js        ← Scrapes Booking.com property listings
│
├── enrichment/
│   ├── email-hunter.js       ← Master email pipeline: runs all sources in order
│   ├── website-checker.js    ← Determines if a business has a real standalone website
│   ├── facebook-lookup.js    ← Finds Facebook business page, extracts contact info
│   ├── instagram-lookup.js   ← Finds Instagram, scans bio for email/phone
│   ├── google-search.js      ← Google search enrichment: finds contact pages, social links
│   └── phone-normalizer.js   ← Cleans and normalises all phone number formats to E.164
│
├── pipeline/
│   ├── coordinator.js        ← Orchestrates scraper → dedup → enrich → filter → save
│   ├── deduplicator.js       ← Cross-source dedup by name+city before DB insert
│   ├── website-filter.js     ← Final gate: drops any lead with a real working website
│   └── lead-scorer.js        ← Scores leads 1–100 based on contact richness + platform count
│
├── utils/
│   ├── delay.js              ← randomDelay(min, max), humanScroll(page), backoff(attempt)
│   ├── email-regex.js        ← Single source of truth for email + phone regex patterns
│   ├── text-cleaner.js       ← Strips HTML, normalises whitespace, extracts structured text
│   ├── url-utils.js          ← Parses, normalises, and fingerprints URLs
│   └── logger.js             ← Pino logger wrapper — all modules import from here
│
├── .env.example              ← All required environment variables documented
├── package.json
└── README.md                 ← Full setup, integration, and maintenance guide
```

---

## DATABASE SCHEMA

File: `db/schema.sql` — run once on setup.

```sql
CREATE TABLE IF NOT EXISTS leads (
  id                  SERIAL PRIMARY KEY,

  -- Identity
  business_name       TEXT NOT NULL,
  business_name_slug  TEXT,                    -- lowercase-hyphenated for dedup matching
  category            TEXT,                    -- 'bed_and_breakfast' | 'guesthouse' | 'boutique_hotel' | 'str_host'

  -- Location
  address             TEXT,
  city                TEXT,
  state               TEXT,
  zip                 TEXT,
  country             TEXT DEFAULT 'US',
  lat                 NUMERIC(10, 7),
  lng                 NUMERIC(10, 7),

  -- Contact
  phone               TEXT,                    -- normalised E.164: +1XXXXXXXXXX
  phone_raw           TEXT,                    -- original string as found
  email               TEXT,                    -- primary email (highest confidence)
  all_emails          TEXT[],                  -- every email found across all sources
  email_sources       TEXT[],                  -- which sources produced each email
  contact_page_url    TEXT,                    -- URL where contact info was found

  -- Website assessment
  has_website         BOOLEAN DEFAULT FALSE,
  website_url         TEXT,                    -- if found anywhere, stored here
  website_quality     TEXT,                    -- 'none' | 'broken' | 'basic' | 'has_booking'
  website_checked_at  TIMESTAMPTZ,

  -- Platform presence (which platforms they're listed on — more = hotter lead)
  on_airbnb           BOOLEAN DEFAULT FALSE,
  airbnb_url          TEXT,
  airbnb_listing_count INTEGER,               -- hosts with 2+ listings are priority
  on_vrbo             BOOLEAN DEFAULT FALSE,
  vrbo_url            TEXT,
  on_booking_com      BOOLEAN DEFAULT FALSE,
  booking_com_url     TEXT,
  on_tripadvisor      BOOLEAN DEFAULT FALSE,
  tripadvisor_url     TEXT,
  on_google_maps      BOOLEAN DEFAULT FALSE,
  google_maps_url     TEXT,
  google_place_id     TEXT,

  -- Social
  facebook_url        TEXT,
  instagram_url       TEXT,
  other_social_links  TEXT[],

  -- Quality signals
  rating              NUMERIC(2, 1),
  review_count        INTEGER,
  platform_count      SMALLINT DEFAULT 0,     -- how many platforms they appear on
  lead_score          SMALLINT,               -- 1–100 composite score

  -- Pipeline state
  scrape_source       TEXT,                   -- which scraper first found this lead
  scrape_status       TEXT DEFAULT 'pending', -- pending | enriched | filtered_out | failed
  filter_reason       TEXT,                   -- why it was filtered out if applicable
  enrichment_status   TEXT DEFAULT 'pending', -- pending | complete | partial | failed
  outreach_status     TEXT DEFAULT 'new',     -- new | contacted | responded | converted | dead
  error_message       TEXT,

  -- Dedup key: Google place_id is best, fallback is name_slug+city+state
  dedup_key           TEXT UNIQUE,

  -- Timestamps
  first_seen_at       TIMESTAMPTZ DEFAULT NOW(),
  enriched_at         TIMESTAMPTZ,
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_leads_dedup_key        ON leads(dedup_key);
CREATE INDEX IF NOT EXISTS idx_leads_has_website      ON leads(has_website);
CREATE INDEX IF NOT EXISTS idx_leads_email            ON leads(email);
CREATE INDEX IF NOT EXISTS idx_leads_phone            ON leads(phone);
CREATE INDEX IF NOT EXISTS idx_leads_scrape_status    ON leads(scrape_status);
CREATE INDEX IF NOT EXISTS idx_leads_outreach_status  ON leads(outreach_status);
CREATE INDEX IF NOT EXISTS idx_leads_lead_score       ON leads(lead_score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_state            ON leads(state);
CREATE INDEX IF NOT EXISTS idx_leads_platform_count   ON leads(platform_count DESC);
CREATE INDEX IF NOT EXISTS idx_leads_category         ON leads(category);
```

---

## SCRAPER SPECIFICATIONS

### 1. `scrapers/google-maps.js`

**What it does**: Searches Google Maps for B&Bs, guesthouses, and boutique hotels in
US cities and extracts all visible business details.

**Flow**:
1. Accept a `query` string (e.g. `"bed and breakfast Austin Texas"`) and `maxResults` int
2. Launch a stealth page, navigate to `https://www.google.com/maps`
3. Fill search input (`input#searchboxinput`), press Enter
4. Wait for `div[role="feed"]` results panel
5. Scroll the feed in human increments (300–600px per step, 300–600ms between steps)
6. Stop scrolling when: no new results after 3 consecutive scrolls, OR maxResults reached,
   OR "You've reached the end of the list" element detected
7. Collect all unique `a[href*="/maps/place/"]` links
8. For each place link, open a fresh page and extract:
   - **Name**: `h1` in the detail pane
   - **Category**: subtitle label beneath name
   - **Address**: element with `data-item-id="address"`, use `aria-label`
   - **Phone**: element with `data-item-id` starting with `"phone:"`, use `aria-label`
   - **Website**: element with `data-item-id="authority"` — if ABSENT → `has_website = false`
   - **Rating**: `span[aria-label*="stars"]` or `span[aria-label*="rating"]`
   - **Review count**: number adjacent to rating
   - **Coordinates**: parse `@{lat},{lng}` from the current URL with regex
   - **Place ID**: extract `ludocid` from URL params or page source
   - **Social links**: scan all `<a>` hrefs for facebook.com, instagram.com
9. After each place, random delay `800–1800ms`
10. Return array of raw place objects

**Selector resilience rule**: Every field must have at minimum TWO selector strategies.
If the primary fails, log a debug warning and try the fallback. Never crash on a missing field.

---

### 2. `scrapers/tripadvisor.js`

**What it does**: Searches TripAdvisor hotel/B&B listings for a given US city and extracts
property details. TripAdvisor is especially valuable because it shows businesses with
NO website clearly.

**Flow**:
1. Accept `city`, `state`, `category` (`'BedAndBreakfast'` | `'Hotel'` | `'Guesthouse'`)
2. Construct search URL:
   `https://www.tripadvisor.com/Search?q={category}+{city}+{state}&searchSessionId=...`
   OR navigate via the Hotels/B&B category pages directly:
   `https://www.tripadvisor.com/Hotels-g{geoId}-{city_slug}-Hotels.html`
3. Collect listing cards from search results page
4. For each listing, click through to the property page and extract:
   - Name, address, city, state, zip
   - Phone (often in the "Contact" section)
   - Website link — if marked "Website: None" or no website element → flag immediately
   - Email — rarely shown directly, note it if present
   - Rating, review count
   - TripAdvisor URL (canonical)
5. Handle pagination — follow "Next" button until maxResults or no more pages
6. Random delay `1500–3000ms` between property page loads
7. Return array of raw property objects

**Critical**: TripAdvisor is more aggressive about bot detection than Google Maps.
Always use stealth mode. Block all images and media. Use a fresh page per property.
If a CAPTCHA is detected (check for `#captcha` or Distil/Imperva challenge page),
log it, wait 30 seconds, and retry once before marking the run as rate-limited.

---

### 3. `scrapers/airbnb.js`

**What it does**: Finds Airbnb hosts who manage 2+ listings — these are small hospitality
businesses, not casual renters. Extracts host profile info.

**Flow**:
1. Accept `city`, `state`, `propertyType` (`'Hotel'` | `'BedAndBreakfast'` | `'GuestSuite'`)
2. Construct search URL with filters for property type:
   `https://www.airbnb.com/s/{City}--{State}/homes?property_type_id[]={typeId}`
3. Scrape listing cards from the search results grid
4. For each listing:
   a. Extract the host's profile link (`/users/show/{hostId}`)
   b. Navigate to the host profile page
   c. Extract: host name, number of listings shown on their profile, host location,
      any contact info visible, host description (scan for email regex)
   d. Only keep hosts with 2+ listings (check "X listings" count on profile)
5. Collect the Airbnb listing URL as `airbnb_url`
6. Do NOT attempt to scrape guest contact info or booking info — host profile only
7. Return array of host objects with listing count and profile URL

**Important**: Airbnb heavily rate-limits scrapers. Use `p-queue` with concurrency=1
and a minimum 4000ms delay between requests. If a 429 or redirect to login is detected,
back off for 60 seconds before retrying.

---

### 4. `scrapers/vrbo.js`

**What it does**: Scrapes VRBO property listings for small hospitality operators.

**Flow**:
1. Accept `city`, `state`
2. Navigate to VRBO search:
   `https://www.vrbo.com/vacation-rentals/usa/{state}/{city}`
3. Scrape listing cards — extract: title, property type, listing URL
4. For each listing, visit the property page and extract:
   - Property name / title
   - Host name (shown as "Hosted by X")
   - City, state from breadcrumbs or structured data
   - Any phone or email visible (rare but possible in description)
   - The VRBO listing URL
   - Check if the host has a "Visit website" link — if so, note it
5. Return array of property objects
6. Minimum 3000ms delay between page loads

---

### 5. `scrapers/booking-com.js`

**What it does**: Scrapes Booking.com property listings for B&Bs and guesthouses.

**Flow**:
1. Accept `city`, `state`, `propertyType` (`'Bed and breakfast'` | `'Guesthouse'` | `'Boutique hotel'`)
2. Navigate to search:
   `https://www.booking.com/searchresults.html?ss={city}%2C+{state}&nflt=ht_id%3D{typeId}`
3. Scrape property cards — extract: name, rating, review count, address snippet, listing URL
4. For each property, click through to the property page and extract:
   - Full address
   - Property description (scan for email regex)
   - Any "Official website" link shown — if present, note it; its absence is a strong signal
   - Language links or social links in the footer of the property description
5. Handle pagination by clicking "Load more results" or Next
6. Random delay `2000–4000ms` between property page loads

---

## ENRICHMENT SPECIFICATIONS

### `enrichment/website-checker.js`

**This is the most important enrichment module.** It determines the final qualification
of every lead. A lead only enters the output if this module confirms no real website.

**Logic**:
1. If a website URL was found during scraping:
   a. Fetch the URL with axios (timeout: 8000ms)
   b. If fetch fails (404, timeout, SSL error, ENOTFOUND) → `website_quality = 'broken'` → KEEP the lead
   c. If fetch succeeds, parse with cheerio and check:
      - Does the page have a booking widget? (check for `book now`, `reserve`, `check availability`
        button text, or iframes from booking engines like Rezovation, Cloudbeds, Lodgify,
        ThinkReservations, BookingSync, Checkfront)
      - Does the page have more than 3 pages of real content (nav links)?
      - Is it just a Facebook redirect or Linktree?
   d. If booking widget detected → `website_quality = 'has_booking'` → FILTER OUT (not a lead)
   e. If thin/basic site with no booking → `website_quality = 'basic'` → KEEP (still a lead)
2. If NO website URL found anywhere → `website_quality = 'none'` → HOT LEAD, keep

**Output**: Sets `has_website`, `website_url`, `website_quality` on the lead object.

---

### `enrichment/email-hunter.js`

Runs 6 sources in order for every lead that passes the website filter.
Stop a source early only if BOTH a valid email AND a valid phone are already confirmed.

**Email regex** (use exactly):
```js
export const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
```

**Phone regex** (US numbers):
```js
export const PHONE_REGEX = /(?:\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/g;
```

**Invalid email reject list**: `@example.com`, `@test.com`, `@domain.com`, `@email.com`,
`@yourname.com`, `@sentry.io`, `@sampleemail`. Also reject any match where the local
part is an image filename pattern (e.g. `photo@2x`, `image@1x`).

**Source 1 — Platform listing page itself**
- Already loaded from the scraper phase
- Scan all text content and `aria-label` attributes for email regex
- Check `mailto:` hrefs directly — these are guaranteed emails
- Check description/about text for phone patterns

**Source 2 — Google search**
- Query: `"{businessName}" "{city}" "{state}" contact OR email OR "get in touch"`
- Fetch `https://www.google.com/search?q={encodedQuery}` via stealth page
- Scan the full HTML: Knowledge Panel, result snippets, site links
- Also try: `"{businessName}" "{city}" site:facebook.com OR site:tripadvisor.com`
- Random delay `2000–4000ms` before each Google search

**Source 3 — Facebook**
- If `facebook_url` known: navigate to it, then click "About" tab
- Scan About section for email, phone, website
- Check `mailto:` hrefs
- Follow any external link in the About section that goes to a contact page
- If no `facebook_url`: search `https://www.facebook.com/search/pages/?q={encodedName}+{encodedCity}`
  Take the first result only if name similarity is strong (implement simple word-overlap check: > 60% of name words must match)
- Random delay `3000–5000ms` — Facebook is aggressive

**Source 4 — Instagram**
- If `instagram_url` known: navigate to it
- Scan bio text (visible without login) for email regex
- Follow any `linktr.ee`, `bio.link`, `beacons.ai`, `campsite.bio` link in bio
  → fetch that landing page with axios → scan for email
- If no Instagram URL: try `https://www.instagram.com/{businessNameSlug}/`
  (generate slug: lowercase, remove non-alphanumeric, max 30 chars)
  Only keep if page title matches business name reasonably

**Source 5 — Business website (if it exists and is basic quality)**
- If `website_url` exists and `website_quality` is `'basic'` or `'broken'`:
  Fetch with axios these paths in order: `/contact`, `/contact-us`, `/about`, `/about-us`, `/info`
  Parse each with cheerio, run email regex on full HTML, scan `mailto:` hrefs
- Do NOT attempt to guess email addresses from domain names

**Source 6 — Google structured data**
- After loading the Google Maps place page, run:
  `page.evaluate(() => document.documentElement.innerHTML)`
- Search the raw HTML for JSON-LD script tags (`application/ld+json`)
- Parse each JSON-LD block — check for `email`, `telephone` properties in `LocalBusiness` schema
- Also run email regex directly on the raw HTML

---

### `enrichment/phone-normalizer.js`

- Normalise all US phone numbers to E.164 format: `+1XXXXXXXXXX`
- Reject numbers with fewer than 10 digits after stripping formatting
- Reject numbers that are clearly not US (no valid area code)
- Return `null` for invalid numbers — do not store garbage

---

### `pipeline/website-filter.js`

**This is the output gate. It is strict. It does not compromise.**

A lead passes this filter ONLY if:
- `website_quality` is `'none'` OR `'broken'` OR `'basic'`
- AND `website_quality` is NOT `'has_booking'`

A lead is filtered out (set `scrape_status = 'filtered_out'`) if:
- `website_quality` is `'has_booking'` — they already have a direct booking solution
- A modern booking engine iframe was detected on their site

Filtered-out leads are NOT deleted — they stay in the DB with `scrape_status = 'filtered_out'`
and `filter_reason` set. This allows future re-evaluation if the filter logic changes.

---

### `pipeline/lead-scorer.js`

Score each passing lead from 0–100. Higher = hotter lead = outreach first.

| Signal | Points |
|---|---|
| Email confirmed | +30 |
| Phone confirmed | +20 |
| On 3+ platforms | +15 |
| On 2 platforms | +8 |
| website_quality = 'none' | +15 |
| website_quality = 'broken' | +8 |
| Review count > 50 | +10 |
| Review count > 20 | +5 |
| Airbnb listing count >= 2 | +10 |
| Category = bed_and_breakfast | +5 |

Store result in `lead_score`. Leads scoring 60+ are priority outreach targets.

---

### `pipeline/deduplicator.js`

Before any DB insert, generate and check a `dedup_key`:

1. If `google_place_id` is known: `dedup_key = "gplace_" + google_place_id`
2. Else: `dedup_key = slugify(businessName) + "_" + slugify(city) + "_" + slugify(state)`
   where `slugify` = lowercase, strip non-alphanumeric, replace spaces with hyphens

If `dedup_key` already exists in DB: update the existing record (merge new data in),
do NOT create a duplicate. Merging rules:
- If existing field is null and new value is not null → update it
- If both have values → keep the one from the higher-confidence source
  (google_maps > tripadvisor > booking_com > airbnb > vrbo)
- Always append to `all_emails[]` and `email_sources[]` arrays (deduplicate the arrays)

---

## MAIN EXPORT: `index.js`

```js
/**
 * Run the full scraper pipeline for one or more queries/cities.
 *
 * @param {Object} config
 * @param {Array<{source: string, query: string, city?: string, state?: string}>} config.targets
 *   Each target specifies which scraper to use and what to search for. Examples:
 *   { source: 'google_maps', query: 'bed and breakfast Austin Texas' }
 *   { source: 'tripadvisor', city: 'Nashville', state: 'Tennessee', category: 'BedAndBreakfast' }
 *   { source: 'airbnb', city: 'Asheville', state: 'North Carolina' }
 *   { source: 'vrbo', city: 'Savannah', state: 'Georgia' }
 *   { source: 'booking_com', city: 'Charleston', state: 'South Carolina' }
 *
 * @param {number} [config.maxResultsPerTarget=60]
 * @param {boolean} [config.skipEnrichment=false]  - Skip email hunting (faster, contact-less output)
 * @param {boolean} [config.dryRun=false]           - Process everything but don't write to DB
 * @param {number}  [config.concurrency=1]          - Parallel pages (keep at 1 unless proxied)
 *
 * @returns {Promise<ScraperResult>}
 */
export async function runScraper(config) { ... }

/**
 * Get current DB stats — useful for the parent system to display progress.
 * @returns {Promise<Stats>}
 */
export async function getStats() { ... }

/**
 * Get leads ready for outreach — filtered, enriched, not yet contacted.
 * @param {Object} options
 * @param {number} [options.minScore=0]
 * @param {string} [options.state]       - Filter by US state
 * @param {boolean} [options.emailOnly]  - Only return leads with confirmed email
 * @param {number}  [options.limit=100]
 * @returns {Promise<Lead[]>}
 */
export async function getLeadsForOutreach(options) { ... }

/**
 * Mark a lead's outreach status — called by the parent system after sending contact.
 * @param {string} dedup_key
 * @param {string} status  - 'contacted' | 'responded' | 'converted' | 'dead'
 */
export async function updateOutreachStatus(dedup_key, status) { ... }
```

**`ScraperResult` shape**:
```js
{
  total_found: number,        // raw results before filtering
  passed_filter: number,      // leads with no real website
  filtered_out: number,       // had a working booking website
  with_email: number,
  with_phone: number,
  new_leads: number,          // not previously in DB
  updated_leads: number,      // already in DB, new data merged
  failed: number,
  duration_ms: number,
  top_leads: Lead[],          // top 10 by lead_score, for quick preview
}
```

---

## ENVIRONMENT VARIABLES

Document all of these in `.env.example`:

```
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=leads_db
DB_USER=postgres
DB_PASSWORD=

# Proxy (optional — residential proxy strongly recommended for production)
PROXY_URL=

# Scraper behaviour
LOG_LEVEL=info           # debug | info | warn | error | silent
MAX_RESULTS_PER_TARGET=60
BROWSER_HEADLESS=true    # set to false for local debugging only
REQUEST_TIMEOUT_MS=8000

# Rate limiting (increase delays if getting blocked)
MIN_DELAY_MS=1200
MAX_DELAY_MS=3000
AIRBNB_MIN_DELAY_MS=4000
FACEBOOK_MIN_DELAY_MS=3000
```

---

## ANTI-DETECTION REQUIREMENTS (non-negotiable — implement all)

1. **Stealth plugin**: Apply `@extra/stealth` to every browser context. No exceptions.
2. **Realistic user agent**: Use this UA string hardcoded (do not randomise):
   `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36`
3. **Viewport**: `1366x768` always
4. **Accept-Language header**: `en-US,en;q=0.9`
5. **Resource blocking**: On every page, block `image`, `font`, `media`, `stylesheet` resource types
   EXCEPT on Facebook and Instagram where stylesheets are needed to render content
6. **Human scroll**: Never use `el.scrollTop = el.scrollHeight` in one jump.
   Always scroll in steps of 300–600px with 200–500ms between steps.
7. **Random delays**: Every inter-request delay uses `randomDelay(min, max)` from utils.
   Never a fixed `setTimeout`. Minimum delay is always at least `MIN_DELAY_MS` env var.
8. **Fresh page per target**: Create a new page for each property/listing.
   Do not reuse pages across different businesses.
9. **One browser instance per run**: Launch once, use for everything, close on completion.
10. **CAPTCHA detection**: Before processing any page, check if a CAPTCHA or challenge
    page is present. If detected: log a warning, wait 30 seconds, retry once.
    If still blocked: skip this target and continue with the next.
11. **Retry with backoff**: On timeout or network error, use exponential backoff:
    wait `attempt * 5000ms`. Max 2 retries. Then mark failed and move on.

---

## INTEGRATION CONTRACT

The parent Node.js system imports ONLY from `./scraper/index.js`:

```js
import {
  runScraper,
  getStats,
  getLeadsForOutreach,
  updateOutreachStatus
} from './scraper/index.js';

// Run scraper (call this on demand or from a job scheduler)
const result = await runScraper({
  targets: [
    { source: 'google_maps', query: 'bed and breakfast Nashville Tennessee' },
    { source: 'tripadvisor', city: 'Nashville', state: 'Tennessee', category: 'BedAndBreakfast' },
    { source: 'airbnb', city: 'Nashville', state: 'Tennessee' },
  ],
  maxResultsPerTarget: 80,
  dryRun: false,
});

// Get leads ready to contact
const leads = await getLeadsForOutreach({
  minScore: 50,
  emailOnly: true,
  limit: 50,
});

// After sending outreach
await updateOutreachStatus('bobs-b-and-b_nashville_tennessee', 'contacted');
```

The scraper uses its own pg Pool. If the parent system also uses pg, they may share
the same DB — the scraper only touches the `leads` table. No other tables are touched.

All scraper logs are prefixed with `[SCRAPER]` for easy filtering in production logs.

---

## README.md MUST COVER

1. Prerequisites: Node 20+, PostgreSQL 14+, Playwright system dependencies for Ubuntu
   (`npx playwright install-deps chromium`)
2. Installation: `npm install`, `npx playwright install chromium`
3. Database setup: `psql -U postgres -d leads_db -f scraper/db/schema.sql`
4. Environment configuration: copy `.env.example` to `.env`, fill in values
5. Standalone test run (without parent system):
   ```bash
   node -e "
     import('./scraper/index.js').then(({ runScraper }) =>
       runScraper({
         targets: [{ source: 'google_maps', query: 'bed and breakfast Austin Texas' }],
         maxResultsPerTarget: 10,
         dryRun: true
       }).then(console.log)
     )
   "
   ```
6. Integration example (as above)
7. Output schema — every field explained
8. How to add a new US city: just pass a new target in `config.targets`
9. Selector maintenance: Google/TripAdvisor class names change. How to inspect and update.
10. Recommended proxy providers for production use
11. Known platform limits and workarounds

---

## QUALITY GATES — VERIFY BEFORE FINISHING

- [ ] `schema.sql` runs cleanly on a fresh PostgreSQL database
- [ ] `runScraper()` completes a full run without crashing for at least one target
- [ ] Duplicate `place_id` / `dedup_key` does NOT create duplicate rows — verified by running same target twice
- [ ] A business with a working Lodgify/Cloudbeds booking site is correctly FILTERED OUT
- [ ] A business with no website is correctly KEPT
- [ ] `getLeadsForOutreach()` returns only leads with `scrape_status != 'filtered_out'`
- [ ] All SQL uses parameterised queries — no string interpolation anywhere
- [ ] All axios calls have timeout set
- [ ] CAPTCHA detection exists in at least Google Maps and TripAdvisor scrapers
- [ ] `.env.example` documents every variable used in `config.js`
- [ ] README covers cold start from zero to first successful run

---

*End of prompt. Do not ask for clarification — make reasonable decisions and document
all assumptions in README.md under an "Implementation Notes" section.*