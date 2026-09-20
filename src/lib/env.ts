/**
 * Public client configuration, validated once at startup.
 *
 * Vite inlines `import.meta.env.VITE_*` at build time. A variable that is not
 * set in the build environment is replaced with `undefined` and the build still
 * succeeds — which is why a deployment missing its configuration looks healthy
 * in CI and fails only once a browser runs it.
 *
 * That failure used to be fatal and silent. `supabase.ts` builds its client at
 * module scope, and `createClient(undefined, undefined)` throws
 * "supabaseUrl is required." while the module graph is still being evaluated —
 * before `createRoot().render()` in main.tsx has run. No React error boundary
 * exists at that point, so nothing could catch it and the page stayed blank.
 *
 * main.tsx now checks this module *before* importing App, so the app's module
 * graph (and therefore supabase.ts) is only ever loaded once the configuration
 * is known to be present.
 *
 * Every name here is public by design: anything prefixed VITE_ is inlined into
 * the bundle that ships to browsers. Server-only secrets must never use that
 * prefix. See .env.example.
 */

/** Public variables the browser cannot start without. */
export const REQUIRED_PUBLIC_ENV = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'] as const;

export type RequiredPublicEnv = (typeof REQUIRED_PUBLIC_ENV)[number];

/**
 * Read with literal member expressions. Vite performs a static text
 * replacement, so `import.meta.env[name]` is NOT substituted — it would read an
 * empty object at runtime and report every variable as missing.
 */
const raw: Record<RequiredPublicEnv, unknown> = {
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
  VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
};

const isPresent = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

/**
 * A URL that is set but unparseable fails inside createClient in the same
 * unrecoverable way an absent one does, so it is treated the same here.
 */
const isUsableUrl = (value: unknown): boolean => {
  if (!isPresent(value)) return false;
  try {
    const { protocol } = new URL(value.trim());
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
};

/**
 * Names of the required public variables that are absent or unusable.
 * Names only — values are never returned, logged or rendered.
 */
export const missingPublicEnv = (): RequiredPublicEnv[] =>
  REQUIRED_PUBLIC_ENV.filter((name) =>
    name === 'VITE_SUPABASE_URL' ? !isUsableUrl(raw[name]) : !isPresent(raw[name])
  );

export type SupabaseConfig = { url: string; anonKey: string };

/**
 * Returns the validated configuration. Throws only if called when the
 * configuration is incomplete, which main.tsx prevents by checking
 * `missingPublicEnv()` first. The message names variables, never values.
 */
export const readSupabaseConfig = (): SupabaseConfig => {
  const missing = missingPublicEnv();
  if (missing.length > 0) {
    throw new Error(`Missing or invalid environment configuration: ${missing.join(', ')}`);
  }
  return {
    url: (raw.VITE_SUPABASE_URL as string).trim(),
    anonKey: (raw.VITE_SUPABASE_ANON_KEY as string).trim(),
  };
};
