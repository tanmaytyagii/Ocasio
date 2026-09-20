import { createClient } from '@supabase/supabase-js';
import { readSupabaseConfig } from './env';

// Validated before the client is built. Previously this passed
// `import.meta.env.VITE_SUPABASE_URL` straight through, so a deployment without
// that variable called createClient(undefined, undefined), which throws during
// module evaluation and left the page blank. See src/lib/env.ts.
const { url, anonKey } = readSupabaseConfig();

export const supabase = createClient(url, anonKey);
