import { z } from 'zod';

export const CoverageMarketSchema = z.object({
  id: z.string().uuid(),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().min(1),
  mode: z.literal('research'),
});
export const CoverageResponseSchema = z.object({ items: z.array(CoverageMarketSchema) });
export type CoverageMarket = z.infer<typeof CoverageMarketSchema>;
export type CoverageResponse = z.infer<typeof CoverageResponseSchema>;

export const ApiErrorSchema = z.object({
  error: z.object({ code: z.string(), message: z.string(), requestId: z.string().uuid() }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export const EnvironmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().url().refine((value) => /^postgres(?:ql)?:/.test(value), 'PostgreSQL URL required'),
  API_HOST: z.string().default('127.0.0.1'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4100),
  WEB_ORIGIN: z.string().url().default('http://127.0.0.1:3000'),
  SESSION_SECRET: z.string().min(32).max(512).refine(value => value.trim().length >= 32),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  SMTP_HOST: z.string().default('127.0.0.1'),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(1025),
  SMTP_SECURE: z.union([z.boolean(),z.enum(['true','false'])]).default(false).transform(v => v === true || v === 'true'),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  MAIL_FROM: z.string().default('Ocasio <hello@ocasio.test>'),
  SESSION_TTL_MINUTES: z.coerce.number().int().min(5).max(1440).default(30),
});
export type Environment = z.infer<typeof EnvironmentSchema>;

export function parseEnvironment(input: Record<string, unknown>): Environment {
  const result = EnvironmentSchema.safeParse(input);
  if (!result.success) {
    // Never include invalid values (which may contain credentials) in errors.
    throw new Error(`Invalid configuration: ${result.error.issues.map((issue) => issue.path.join('.')).join(', ')}`);
  }
  const origin = new URL(result.data.WEB_ORIGIN);
  if (!['http:', 'https:'].includes(origin.protocol) || origin.origin !== result.data.WEB_ORIGIN) {
    throw new Error('WEB_ORIGIN must be an exact HTTP(S) origin without a path');
  }
  if (result.data.NODE_ENV === 'production' && origin.protocol !== 'https:') {
    throw new Error('Production WEB_ORIGIN must use HTTPS');
  }
  return result.data;
}

export const SessionBootstrapSchema = z.object({
  authenticated: z.boolean(),
  csrfToken: z.string().regex(/^[a-f0-9]{64}$/),
});
export type SessionBootstrap = z.infer<typeof SessionBootstrapSchema>;
