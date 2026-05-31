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

