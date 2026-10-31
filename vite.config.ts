import { readFileSync } from 'node:fs';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Mirrors REQUIRED_PUBLIC_ENV in src/lib/env.ts. That module cannot be imported
 * here: it reads import.meta.env at module scope, which only exists inside the
 * client build.
 */
const REQUIRED_PUBLIC_ENV = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'] as const;

const isHttpUrl = (value: string): boolean => {
  try {
    const { protocol } = new URL(value);
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
};

/**
 * Vite inlines VITE_* at build time and builds happily without them, so a
 * deployment missing its configuration used to ship and only fail in the
 * browser (src/lib/env.ts). Failing the build instead means Vercel never
 * promotes it.
 */
function assertBuildEnv(env: Record<string, string>): void {
  const missing = REQUIRED_PUBLIC_ENV.filter((name) => {
    const value = env[name]?.trim() ?? '';
    return name === 'VITE_SUPABASE_URL' ? !isHttpUrl(value) : value.length === 0;
  });
  if (missing.length > 0) {
    throw new Error(
      `Missing or invalid build environment: ${missing.join(', ')}. ` +
        'Set them in .env locally or in the hosting provider. See .env.example.',
    );
  }
  if (!env.VITE_SUPPORT_EMAIL?.trim()) {
    console.warn(
      '[ocasio] VITE_SUPPORT_EMAIL is not set: the contact and legal pages will say the ' +
        'support inbox is not configured yet.',
    );
  }
}

type VercelConfig = {
  headers?: { source: string; headers: { key: string; value: string }[] }[];
};

/**
 * The production response headers from vercel.json, so `vite preview` serves
 * the build under the same policy Vercel does. Playwright runs against the
 * preview server, which makes the E2E suite a test of the CSP as well.
 *
 * One adjustment: a build pointed at a local Supabase stack talks to
 * http://127.0.0.1:54321, which the production policy (https://*.supabase.co)
 * rightly refuses. That one origin is appended to connect-src and img-src;
 * nothing else is relaxed.
 */
function productionHeaders(supabaseUrl: string | undefined): Record<string, string> {
  const config = JSON.parse(
    readFileSync(new URL('./vercel.json', import.meta.url), 'utf8'),
  ) as VercelConfig;
  const rule = config.headers?.find((entry) => entry.source === '/(.*)');
  const headers = Object.fromEntries((rule?.headers ?? []).map(({ key, value }) => [key, value]));

  const origin = supabaseUrl && isHttpUrl(supabaseUrl) ? new URL(supabaseUrl).origin : null;
  const csp = headers['Content-Security-Policy'];
  if (csp && origin && !/^https:\/\/[^/]+\.supabase\.co$/.test(origin)) {
    headers['Content-Security-Policy'] = csp
      .split(';')
      .map((directive) => directive.trim())
      .map((directive) =>
        /^(connect-src|img-src)\s/.test(directive) ? `${directive} ${origin}` : directive,
      )
      .join('; ');
  }
  return headers;
}

// https://vitejs.dev/config/
export default defineConfig(({ command, mode, isPreview }) => {
  // Includes VITE_* from process.env, which takes priority over .env files —
  // that is how CI and Playwright pass configuration.
  const env = loadEnv(mode, process.cwd(), 'VITE_');

  if (command === 'build') assertBuildEnv(env);

  return {
    plugins: [react()],
    optimizeDeps: {
      exclude: ['lucide-react'],
    },
    preview: isPreview ? { headers: productionHeaders(env.VITE_SUPABASE_URL) } : {},
  };
});
