# Apify Auto Scheduler Setup Guide

## Overview

This guide explains how to set up the Apify auto scheduler to run the WhatsApp outreach system fully automated.

## Prerequisites

1. **Apify Account**: Create an account at [apify.com](https://apify.com)
2. **CRON_SECRET**: Generate a secret token for endpoint protection
3. **Deployed App**: Your application must be deployed with public endpoints

---

## Environment Variables

Add these to your `.env`:

```bash
APIFY_API_TOKEN=your_apify_token_here
CRON_SECRET=your_secure_random_secret_here
```

---

## Scheduler Configuration

### Option 1: Apify Scheduled Tasks

1. Go to **Apify Console** → **Tasks** → **Create Task**
2. Use the **HTTP Request** actor (`apify/http-request`)
3. Create 4 tasks:

#### Task 1: Daily Scrape (5:00 AM EAT)

```json
{
  "url": "https://your-domain.com/api/cron/scrape",
  "method": "POST",
  "headers": {
    "Authorization": "Bearer YOUR_CRON_SECRET"
  }
}
```

**Schedule**: `0 2 * * *` (2:00 AM UTC = 5:00 AM EAT)

#### Task 2: Morning Dispatch (6:30 AM EAT)

```json
{
  "url": "https://your-domain.com/api/cron/dispatch?window=morning",
  "method": "POST",
  "headers": {
    "Authorization": "Bearer YOUR_CRON_SECRET"
  }
}
```

**Schedule**: `30 3 * * *` (3:30 AM UTC = 6:30 AM EAT)

#### Task 3: Lunch Dispatch (12:30 PM EAT)

```json
{
  "url": "https://your-domain.com/api/cron/dispatch?window=lunch",
  "method": "POST",
  "headers": {
    "Authorization": "Bearer YOUR_CRON_SECRET"
  }
}
```

**Schedule**: `30 9 * * *` (9:30 AM UTC = 12:30 PM EAT)

#### Task 4: Evening Dispatch (7:30 PM EAT)

```json
{
  "url": "https://your-domain.com/api/cron/dispatch?window=evening",
  "method": "POST",
  "headers": {
    "Authorization": "Bearer YOUR_CRON_SECRET"
  }
}
```

**Schedule**: `30 16 * * *` (4:30 PM UTC = 7:30 PM EAT)

---

### Option 2: External Cron Service

Use [cron-job.org](https://cron-job.org), [Upstash](https://upstash.com), or **DigitalOcean Cron Jobs**:

| Time (EAT) | UTC | Endpoint | Purpose |
|------------|-----|----------|---------|
| 5:00 AM | 2:00 AM | `/api/cron/scrape` | Scrape leads |
| 6:30 AM | 3:30 AM | `/api/cron/dispatch?window=morning` | Send 30 msgs |
| 12:30 PM | 9:30 AM | `/api/cron/dispatch?window=lunch` | Send 30 msgs |
| 7:30 PM | 4:30 PM | `/api/cron/dispatch?window=evening` | Send 40 msgs |

---

## City Rotation Schedule

The system automatically rotates cities weekly:

| Day | Cities |
|-----|--------|
| Monday | Kampala, Entebbe |
| Tuesday | Jinja, Mukono |
| Wednesday | Mbarara, Masaka |
| Thursday | Gulu, Lira |
| Friday | Mbale, Soroti |
| Saturday | Fort Portal, Kasese |
| Sunday | Ntinda, Bugolobi, Muyenga, Kololo |

---

## Keyword Rotation

- Each city + keyword combination has a **7-day cooldown**
- The system automatically skips combos on cooldown
- This ensures freshness and avoids duplicate patterns

### Example:
- Monday: "clinic in Kampala" ✅
- Tuesday–Sunday: "clinic in Kampala" ⏸️ (on cooldown)
- Next Monday: "clinic in Kampala" ✅ (cooldown expired)

---

## Reserve Pool Logic

The system maintains a reserve pool of excess leads:

1. **Scrape Phase**: 
   - Fills daily queue first
   - Excess leads → Reserve Pool (with priority scores)

2. **Dispatch Phase**:
   - Pulls 30% from reserve pool
   - Fills rest with today's queue
   - This ensures lead freshness while maximizing utilization

### Priority Scoring:
- No website: +25 points
- Rating ≥4.5: +15 points
- Rating ≥4.0: +10 points
- Has WhatsApp: +10 points

Higher priority leads are dispatched first.

---

## Monitoring

### Check Daily Summary

Query Firestore: `daily_summaries/{YYYY-MM-DD}`

```typescript
{
  date: "2024-12-17",
  scrape: {
    totalScraped: 250,
    addedToQueue: 100,
    addedToReserve: 120
  },
  dispatch: {
    morning: { sent: 30, fromReserve: 9 },
    lunch: { sent: 30, fromReserve: 9 },
    evening: { sent: 40, fromReserve: 12 }
  },
  totals: {
    messagesSent: 100,
    messagesFromReserve: 30,
    blocksDetected: 0
  }
}
```

### Check Reserve Pool

Query Firestore: `reserve_pool` where `status == "available"`

### Check Rotation Status

Query Firestore: `rotation_tracker`

---

## Safety Features

1. **7-day keyword rotation**: Prevents pattern detection
2. **30-day phone cooldown**: Prevents over-messaging
3. **Priority scoring**: Best leads go first
4. **Reserve pool**: Never run out of leads
5. **Error logging**: All failures tracked in daily summary
6. **CRON_SECRET**: Endpoints protected from unauthorized access

---

## Troubleshooting

### No leads scraped
- Check Apify balance
- Verify `APIFY_API_TOKEN` is set
- Check rotation tracker for cooldowns

### Dispatch not sending
- Verify WhatsApp session is active
- Check `leads_queue` has pending leads
- Check server logs for errors

### Buttons greyed out in PWA
- Refresh the page
- Check Firebase connection
- Verify `NEXT_PUBLIC_FIREBASE_*` variables

---

## Files Reference

| File | Purpose |
|------|---------|
| `outreach-config.ts` | Business types, time windows, cities |
| `scrape-cron.ts` | Main scrape logic |
| `reserve-pool.ts` | Reserve pool management |
| `rotation-tracker.ts` | Keyword rotation (7-day cooldown) |
| `message-variants.ts` | Business-type specific messages |
| `daily-summary.ts` | Logging and monitoring |
| `deduplication.ts` | Phone cooldown (30 days) |
| `leads-queue.ts` | Daily queue management |
