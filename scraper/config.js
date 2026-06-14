import { z } from 'zod';
import * as dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.coerce.number().default(5432),
  DB_NAME: z.string().default('leads_db'),
  DB_USER: z.string().default('postgres'),
  DB_PASSWORD: z.string().optional().default(''),
  
  PROXY_URL: z.string().optional(),
  
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'silent']).default('info'),
  MAX_RESULTS_PER_TARGET: z.coerce.number().default(60),
  BROWSER_HEADLESS: z.coerce.boolean().default(true),
  REQUEST_TIMEOUT_MS: z.coerce.number().default(8000),
  
  MIN_DELAY_MS: z.coerce.number().default(1200),
  MAX_DELAY_MS: z.coerce.number().default(3000),
  AIRBNB_MIN_DELAY_MS: z.coerce.number().default(4000),
  FACEBOOK_MIN_DELAY_MS: z.coerce.number().default(3000),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment variables:", parsed.error.format());
  process.exit(1);
}

export const config = parsed.data;
