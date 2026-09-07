import { z } from 'zod';
import dotenv from 'dotenv';
dotenv.config();

const envSchema = z.object({
  DATABASE_URL: z.string().optional(),
  GOOGLE_API_KEY: z.string().optional(),
  SUPABASE_URL: z.string().optional(),
  SUPABASE_SERVICE_KEY: z.string().optional(),
  CORS_ORIGIN: z.string().optional(),
  UPLOAD_DIR: z.string().optional(),
  GENERATED_DIR: z.string().optional(),
  JWT_SECRET: z.string().default('super-secret'),
  PORT: z.coerce.number().default(8000),
});

export const env = envSchema.parse(process.env);
