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
