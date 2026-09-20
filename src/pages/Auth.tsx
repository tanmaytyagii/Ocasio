import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowLeft, ArrowRight, Eye, EyeOff, Lock, Mail, MailCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { usePageMeta } from '../hooks/usePageMeta';
import { resolveReturnPath, returnIntent } from '../lib/returnPath';
import {
  GENERIC_AUTH_ERROR,
  MIN_PASSWORD_LENGTH,
  signInErrorMessage,
  signUpErrorMessage,
} from '../lib/authErrors';
import AuthEditorialPanel from '../components/auth/AuthEditorialPanel';
import AuthField from '../components/auth/AuthField';
import { Button } from '../components/ui';

/**
 * Sign in and create account.
 *
 * ── What did not change ──────────────────────────────────────────────────────
 *
 * The authentication itself: signInWithPassword and signUp against the same
 * client, no role in metadata (handle_new_user() provisions role='customer',
 * and becoming a vendor goes through onboarding review), and the same
 * standalone route outside the site chrome.
 *
 * ── What did ─────────────────────────────────────────────────────────────────
 *
 *   - The destination after signing in is validated rather than trusted, and
 *     keeps its query string. See lib/returnPath.
 *   - Sign-up no longer claims a confirmation email was sent regardless of
 *     what happened. Supabase returns a session when confirmations are off, so
 *     the account is live and the user is taken to where they were going; a
 *     null session is the case where confirmation really is required, and only
 *     then are they told to check their inbox.
 *   - GoTrue's own error text never reaches the screen. Every failure is
 *     mapped in lib/authErrors, which also decides how much to say: a failed
 *     sign-in never reveals which half was wrong.
 *   - The two modes are a tablist rather than a button that swaps the form
 *     under you, so the choice is visible before it is made and reachable from
 *     the keyboard.
 *
 * ── Composition ──────────────────────────────────────────────────────────────
 *
 * A split screen from lg up: editorial panel, then the form. Below lg the panel
 * becomes a compact brand band and the form takes the screen — the two are
 * different compositions of one design, not one design at two sizes.
 *
 * The form column is bounded and vertically centred, but the panel is anchored
 * at three points — the return link at the top, the form in the middle, the
 * browse line at the bottom — so at 1920 and beyond it reads as a composed
 * page rather than a card adrift in white space. Past 1800px the editorial
 * half takes the extra width, because photography absorbs it and a form does
 * not.
 *
 * No OAuth buttons: supabase/config.toml has no provider enabled, and a button
 * for something that does not work is worse than no button. No password reset
 * either — see the note at the end of the file.
 */

const MODES = [
  { id: 'signin', tabId: 'auth-tab-signin', label: 'Sign in' },
  { id: 'signup', tabId: 'auth-tab-signup', label: 'Create account' },
] as const;

type Mode = (typeof MODES)[number]['id'];

const ORDER: Mode[] = ['signin', 'signup'];
const ERROR_ID = 'auth-error';

const Auth = () => {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const navigate = useNavigate();
  const location = useLocation();
  const tabRefs = useRef<Record<Mode, HTMLButtonElement | null>>({ signin: null, signup: null });
  const submitRef = useRef<HTMLButtonElement>(null);

  const isSignIn = mode === 'signin';

  /**
   * Put focus back on the button that failed.
   *
   * Submitting disables the button, and disabling the focused element drops
   * focus to <body> — so without this, someone who submitted from the keyboard
   * hears the error announced and then has to tab from the top of the document
   * to reach the form again. Only ever runs after a submit, so it cannot
   * interrupt typing.
   */
  useEffect(() => {
    if (error && !submitting) submitRef.current?.focus();
  }, [error, submitting]);

  // Auth pages should not compete with the marketplace in search results, and
  // there is nothing here worth indexing.
  usePageMeta(
    isSignIn ? 'Sign in — Ocasio' : 'Create an account — Ocasio',
    'Sign in to Ocasio or create an account to book vendors for your event.',
    'noindex, nofollow',
  );

  const returnTo = useMemo(
    () => resolveReturnPath(location.state, location.search),
    [location.state, location.search],
  );
  const intent = useMemo(() => returnIntent(location.state), [location.state]);

  const switchMode = useCallback((next: Mode) => {
    setMode(next);
    // A credential error left under the other tab reads as a fresh failure.
    setError(null);
    setNotice(null);
    // Do not carry a revealed password across a deliberate context switch.
    setPasswordVisible(false);
  }, []);

  /** Arrow, Home and End move between tabs, per the ARIA tabs pattern. */
  const onTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = ORDER.indexOf(mode);
    let next: Mode | null = null;

    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      next = ORDER[(index + 1) % ORDER.length];
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      next = ORDER[(index - 1 + ORDER.length) % ORDER.length];
    } else if (event.key === 'Home') {
      next = ORDER[0];
    } else if (event.key === 'End') {
      next = ORDER[ORDER.length - 1];
    }

    if (!next) return;
    event.preventDefault();
    switchMode(next);
    tabRefs.current[next]?.focus();
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    // Guards a double click and a resubmitted form; the button is also
    // disabled while this runs.
    if (submitting) return;

    setSubmitting(true);
    setError(null);
    setNotice(null);

    const address = email.trim();

    try {
      if (isSignIn) {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: address,
          password,
        });

        if (signInError) {
          // Technical detail stays in the console, as everywhere else.
          console.error('[ocasio] sign-in:', signInError.message);
          setError(signInErrorMessage(signInError));
          return;
        }

        navigate(returnTo, { replace: true });
        return;
      }

      const { data, error: signUpError } = await supabase.auth.signUp({
        email: address,
        password,
      });

      if (signUpError) {
        console.error('[ocasio] sign-up:', signUpError.message);
        setError(signUpErrorMessage(signUpError));
        return;
      }

      // A session means this project has email confirmation switched off, so
      // the account is already usable. Telling them to check their inbox here
      // — which is what this page used to do unconditionally — sends them
      // looking for an email that was never sent.
      if (data.session) {
        navigate(returnTo, { replace: true });
        return;
      }

      setNotice(
        `Check your inbox. We have sent a confirmation link to ${address}. Your account is not active until you open it.`,
      );
    } catch (unknownError) {
      console.error('[ocasio] auth:', unknownError);
      setError(GENERIC_AUTH_ERROR);
    } finally {
      setSubmitting(false);
    }
  };

  const activeTabId = isSignIn ? MODES[0].tabId : MODES[1].tabId;
  const submitLabel = isSignIn
    ? submitting
      ? 'Signing in…'
      : 'Sign in'
    : submitting
      ? 'Creating your account…'
      : 'Create account';

  return (
    // Flex below lg, grid from lg. Not `grid` throughout: with auto rows and a
    // 100vh minimum, both rows stretch to share the screen, which gave the
    // phone a 200px brand band with 100px of nothing under the eyebrow.
    <div
      className="flex min-h-screen flex-col bg-surface
                 lg:grid lg:grid-cols-[46fr_54fr] xl:grid-cols-[48fr_52fr] min-[1800px]:grid-cols-[55fr_45fr]"
    >
      <AuthEditorialPanel />

      {/*
        The container for the column below. Type and measure here answer to the
        width of this panel, not of the window — at 2560 the window is nearly
        twice what this half actually is, and sizing against it is how a form
        ends up marooned in white space.
      */}
      <section
        className="flex flex-1 flex-col px-[clamp(1.25rem,5vw,2rem)] pb-8 pt-5
                   lg:[container-type:inline-size] lg:px-[clamp(2.5rem,4vw,5rem)] lg:pb-[clamp(2.25rem,3vw,3.5rem)] lg:pt-[clamp(2.25rem,3.2vw,3.5rem)]"
      >
        {/* ── return ─────────────────────────────────────────────────────── */}
        <div className="flex justify-end">
          <Link
            to="/"
            className="group inline-flex h-11 items-center gap-2 rounded-control px-3 text-sm font-medium text-muted transition-colors hover:bg-canvas hover:text-ink"
          >
            <ArrowLeft
              className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-0.5"
              aria-hidden="true"
            />
            Back to home
          </Link>
        </div>

        {/* ── form column ───────────────────────────────────────────────── */}
        <div className="animate-rise-in mx-auto flex w-full max-w-[27rem] flex-1 flex-col justify-center py-6 lg:max-w-[clamp(27rem,46cqw,34rem)] lg:py-8">
          {/* Two curves, because one cannot serve both compositions: viewport
              units while the panel is the whole screen, container units once
              it is a column beside a photograph. */}
          <h1 className="text-[length:clamp(1.625rem,4.2vw,1.875rem)] font-semibold leading-[1.1] tracking-[-0.025em] text-ink lg:text-[length:clamp(1.75rem,5cqw,2.75rem)]">
            Welcome to Ocasio
          </h1>
          <p className="mt-3 text-[0.9375rem] leading-[1.65] text-muted">
            Sign in to your account or create a new one to get started.
          </p>

          {/* Set by whichever surface sent them here — FavoritesContext passes
              'save this vendor'. Shown only when one was supplied. */}
          {intent && (
            <p className="mt-4 w-fit rounded-control bg-brand-50 px-3.5 py-2 text-[0.8125rem] font-medium text-brand-800">
              Sign in to {intent}.
            </p>
          )}

          {/* ── mode ─────────────────────────────────────────────────────
              role="tab", not plain buttons: it gives the pair keyboard
              semantics, and it keeps the accessible name "Sign in" on exactly
              one button — the one that submits. */}
          <div
            role="tablist"
            aria-label="Sign in or create an account"
            onKeyDown={onTabKeyDown}
            className="relative mt-7 grid grid-cols-2 rounded-[0.625rem] border border-line bg-canvas p-1"
          >
            <span
              aria-hidden="true"
              className={`pointer-events-none absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-[0.5rem] bg-surface shadow-card transition-transform duration-300 ease-out ${
                isSignIn ? 'translate-x-0' : 'translate-x-full'
              }`}
            />
            {MODES.map((m) => (
              <button
                key={m.id}
                ref={(node) => {
                  tabRefs.current[m.id] = node;
                }}
                type="button"
                role="tab"
                id={m.tabId}
                aria-selected={mode === m.id}
                aria-controls="auth-panel"
                tabIndex={mode === m.id ? 0 : -1}
                onClick={() => switchMode(m.id)}
                className={`relative z-10 h-11 rounded-[0.5rem] text-sm font-medium transition-colors ${
                  mode === m.id ? 'text-ink' : 'text-muted hover:text-ink-soft'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          <div
            role="tabpanel"
            id="auth-panel"
            aria-labelledby={activeTabId}
            tabIndex={-1}
            className="focus:outline-none"
          >
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <AuthField
                label="Email address"
                id="email"
                name="email"
                type="email"
                icon={Mail}
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="you@example.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? ERROR_ID : undefined}
                disabled={submitting}
              />

              <AuthField
                label="Password"
                id="password"
                name="password"
                type={passwordVisible ? 'text' : 'password'}
                icon={Lock}
                // 'new-password' asks a password manager to offer a generated
                // one; 'current-password' asks it to fill the saved one.
                autoComplete={isSignIn ? 'current-password' : 'new-password'}
                // Only on sign-up: an existing account may predate the rule,
                // and blocking its owner from signing in would be absurd.
                minLength={isSignIn ? undefined : MIN_PASSWORD_LENGTH}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? ERROR_ID : undefined}
                disabled={submitting}
                trailing={
                  <button
                    type="button"
                    onClick={() => setPasswordVisible((v) => !v)}
                    aria-controls="password"
                    className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-control text-muted transition-colors hover:bg-canvas hover:text-ink-soft"
                  >
                    {/*
                      The name is content, not aria-label, and deliberately so.
                      An aria-label of "Show password" makes this button answer
                      to getByLabel('Password') alongside the field itself —
                      which is how six existing suites locate that field. The
                      accessible name is identical either way.

                      No aria-pressed: the name already changes with the state,
                      and announcing both reads as "Hide password, pressed".
                    */}
                    <span className="sr-only">
                      {passwordVisible ? 'Hide password' : 'Show password'}
                    </span>
                    {passwordVisible ? (
                      <EyeOff className="h-[1.0625rem] w-[1.0625rem]" aria-hidden="true" />
                    ) : (
                      <Eye className="h-[1.0625rem] w-[1.0625rem]" aria-hidden="true" />
                    )}
                  </button>
                }
              />

              {/* Assertive: the person is waiting on this answer. The node is
                  permanent so the region exists before it has content. */}
              <div role="alert" aria-live="assertive" aria-atomic="true">
                {error && (
                  <p
                    id={ERROR_ID}
                    className="flex items-start gap-2.5 rounded-control border border-red-200 bg-red-50 px-3.5 py-3 text-[0.8125rem] leading-relaxed text-red-800"
                  >
                    <AlertCircle className="mt-px h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{error}</span>
                  </p>
                )}
              </div>

              <div role="status" aria-live="polite" aria-atomic="true">
                {notice && (
                  <p className="flex items-start gap-2.5 rounded-control border border-brand-200 bg-brand-50 px-3.5 py-3 text-[0.8125rem] leading-relaxed text-brand-900">
                    <MailCheck className="mt-px h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{notice}</span>
                  </p>
                )}
                {submitting && <span className="sr-only">{submitLabel}</span>}
              </div>

              <Button
                ref={submitRef}
                type="submit"
                size="lg"
                fullWidth
                loading={submitting}
                className="group !mt-6"
              >
                {submitLabel}
                {!submitting && (
                  <ArrowRight
                    className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                )}
              </Button>
            </form>

            {/* Already true before this change, and still the thing an
                applicant most needs to know. */}
            {!isSignIn && (
              <p className="mt-5 rounded-control border border-line bg-canvas px-4 py-3.5 text-[0.8125rem] leading-[1.6] text-muted">
                Every account starts as a customer account. To list a business, create an account
                and then apply through{' '}
                <Link
                  to="/become-vendor"
                  className="font-medium text-brand-700 underline-offset-2 hover:underline"
                >
                  Become a vendor
                </Link>
                . Vendor listings go live after review.
              </p>
            )}
          </div>
        </div>

        {/* ── third anchor ───────────────────────────────────────────────
            The marketplace is public, so "sign in first" would be a lie. */}
        <p className="mx-auto w-full max-w-[27rem] text-center text-[0.8125rem] text-muted lg:max-w-[clamp(27rem,46cqw,34rem)] lg:text-left">
          Just looking?{' '}
          <Link to="/vendors" className="font-medium text-brand-700 underline-offset-2 hover:underline">
            Browse vendors
          </Link>{' '}
          without an account.
        </p>
      </section>
    </div>
  );
};

export default Auth;

/*
 * Password reset is deliberately absent.
 *
 * Nothing in the product implements it today: there is no call to
 * resetPasswordForEmail, no recovery route to land on, and
 * supabase/config.toml lists only http://127.0.0.1:3000 in
 * auth.additional_redirect_urls with no SMTP sender configured. A real flow
 * needs all three, plus production redirect allow-listing that cannot be set
 * from this repository. A "Forgot password?" link that sent mail nobody could
 * act on would be worse than its absence, so the gap is left visible rather
 * than papered over.
 */
