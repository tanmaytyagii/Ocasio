/**
 * Shown instead of a blank page when the app cannot start.
 *
 * Rendered by main.tsx before the application's module graph is loaded, so it
 * deliberately depends on nothing but React and the stylesheet — no router, no
 * contexts, no Supabase client, no icon library. Anything it imported could
 * itself be the thing that failed.
 *
 * It names the missing *variables* so whoever operates the deployment can act
 * on it. It never renders their values, any key, any credential, or a stack
 * trace: this page is served to the public.
 */
type StartupErrorProps = {
  /** Public variable names that are absent or unusable. Never their values. */
  missing?: readonly string[];
};

const StartupError = ({ missing = [] }: StartupErrorProps) => (
  <div className="flex min-h-screen items-center justify-center bg-canvas px-5 py-12">
    <div
      role="alert"
      className="w-full max-w-lg rounded-card border border-line bg-surface p-7 shadow-card sm:p-9"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Ocasio</p>

      <h1 className="mt-3 text-2xl font-semibold leading-snug text-ink">
        This site isn&rsquo;t available right now
      </h1>

      <p className="mt-3 text-[0.95rem] leading-relaxed text-ink-soft">
        Ocasio could not start because it is missing part of its configuration. This is a problem
        with the deployment, not with anything you did, and nobody can use the site until it is
        fixed.
      </p>

      <p className="mt-3 text-[0.95rem] leading-relaxed text-ink-soft">
        If you were trying to reach a vendor or a booking, please try again later.
      </p>

      {missing.length > 0 && (
        <div className="mt-6 border-t border-line pt-5">
          <h2 className="text-sm font-medium text-ink">For whoever maintains this deployment</h2>
          <p className="mt-1.5 text-sm text-muted">
            Set the following public environment {missing.length === 1 ? 'variable' : 'variables'}{' '}
            in the hosting provider and redeploy:
          </p>
          <ul className="mt-2.5 space-y-1">
            {missing.map((name) => (
              <li
                key={name}
                className="rounded-control bg-canvas px-2.5 py-1.5 font-mono text-xs text-ink-soft"
              >
                {name}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  </div>
);

export default StartupError;
