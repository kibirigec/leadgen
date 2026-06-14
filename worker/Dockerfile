# ─── Stage 1: Install dependencies ───────────────────────────────────────────
FROM node:20-slim AS deps

WORKDIR /app/worker

COPY worker/package.json worker/package-lock.json* ./
RUN npm ci

# ─── Stage 2: Build TypeScript ────────────────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app

# Copy shared types (worker tsconfig has rootDir: ".." and includes shared/)
COPY shared/ ./shared/

# Copy worker source
COPY worker/ ./worker/

# Copy deps
COPY --from=deps /app/worker/node_modules ./worker/node_modules

# Build from within worker dir (tsc uses worker/tsconfig.json)
WORKDIR /app/worker
RUN npm run build

# ─── Stage 3: Runner ──────────────────────────────────────────────────────────
FROM node:20-slim AS runner

# Install Chrome for Puppeteer (WhatsApp bot)
RUN apt-get update \
    && apt-get install -y wget gnupg \
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/googlechrome-linux-keyring.gpg \
    && sh -c 'echo "deb [arch=amd64 signed-by=/usr/share/keyrings/googlechrome-linux-keyring.gpg] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
    && apt-get update \
    && apt-get install -y google-chrome-stable fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf libxss1 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable
# Run fully headless inside Docker — no xvfb needed
ENV HEADLESS=true
ENV NODE_ENV=production

WORKDIR /app

# Copy built output from builder
COPY --from=builder /app/worker/dist ./worker/dist
COPY --from=deps /app/worker/node_modules ./worker/node_modules

EXPOSE 3001

CMD ["node", "worker/dist/worker/src/index.js"]
