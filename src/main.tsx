import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { missingPublicEnv } from './lib/env';
import StartupError from './components/StartupError';

/**
 * Entry point.
 *
 * The configuration check runs before App is imported, and App is imported
 * dynamically for exactly that reason: static imports are all evaluated before
 * a module's own body runs, so `import App from './App'` would pull in
 * AuthContext and therefore lib/supabase.ts first. That module builds its
 * client at module scope, and createClient throws on a missing URL — before
 * this file has rendered anything and before any error boundary exists. The
 * result was an uncaught "supabaseUrl is required." and a blank white page.
 *
 * Checking first, then importing, means the application's module graph is only
 * loaded once its configuration is known to be usable, and a misconfigured
 * deployment renders a readable message instead of nothing at all.
 */
const root = createRoot(document.getElementById('root')!);

const missing = missingPublicEnv();

if (missing.length > 0) {
  root.render(
    <StrictMode>
      <StartupError missing={missing} />
    </StrictMode>
  );
} else {
  void import('./App')
    .then(({ default: App }) => {
      root.render(
        <StrictMode>
          <App />
        </StrictMode>
      );
    })
    .catch(() => {
      // Configuration was present but startup still failed — a chunk that
      // could not be fetched, or a module that threw while evaluating. Show the
      // same readable page rather than leaving the user on a blank screen. No
      // detail is rendered: this is public, and the browser console already has
      // the real error for whoever is debugging.
      root.render(
        <StrictMode>
          <StartupError />
        </StrictMode>
      );
    });
}
