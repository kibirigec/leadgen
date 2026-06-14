# ─── Stage 1: Install root dependencies ──────────────────────────────────────
FROM node:20-slim AS deps

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# ─── Stage 2: Runner ──────────────────────────────────────────────────────────
FROM node:20-slim AS runner

# Playwright / browser system dependencies
RUN apt-get update \
    && apt-get install -y \
        wget \
        gnupg \
        libnss3 \
        libatk1.0-0 \
        libatk-bridge2.0-0 \
        libcups2 \
        libdrm2 \
        libxkbcommon0 \
        libxcomposite1 \
        libxdamage1 \
        libxfixes3 \
        libxrandr2 \
        libgbm1 \
        libasound2 \
        fonts-liberation \
        fonts-ipafont-gothic \
        fonts-wqy-zenhei \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

ENV BROWSER_HEADLESS=true
ENV NODE_ENV=production

WORKDIR /app

# Copy only scraper source + shared deps from root
COPY scraper/ ./scraper/
COPY shared/ ./shared/
COPY --from=deps /app/node_modules ./node_modules

# Install Playwright's Chromium binary
RUN npx playwright install chromium --with-deps 2>/dev/null || true

# Default: dry-run test (exits cleanly, no real creds needed)
# Override CMD to run the full pipeline
CMD ["node", "scraper/test.js"]
