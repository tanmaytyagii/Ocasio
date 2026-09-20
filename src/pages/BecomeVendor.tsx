import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Check, Clock, Loader2, ShieldCheck } from 'lucide-react';
import { requestVendorOnboarding, getMyVendor, getFilterOptions } from '../services/vendors';
import { useAuth } from '../contexts/AuthContext';
import { usePageMeta } from '../hooks/usePageMeta';
import { Button, ButtonLink, ErrorState, Notice, TextField, SelectField, TextAreaField } from '../components/ui';
import type { FilterOptions, PublicVendor } from '../types/database';

/**
 * Vendor application.
 *
 * This page used to collect a business profile, show three subscription tiers
 * at ₹999–₹4,999, take a simulated payment, and then tell the applicant their
 * details "have not been stored or sent anywhere". It now calls
 * request_vendor_onboarding(), which has existed since migration 2.
 *
 * The plans are gone rather than restyled. They promised featured placement,
 * social promotion, performance reports and a dedicated account manager — none
 * of which exist, and charging for them while the form stored nothing was the
 * single most misleading surface in the product. Ocasio has no billing, so an
 * application is free.
 *
 * Only the fields the RPC accepts are collected. owner_id, slug and status are
 * derived server-side; a price cannot be set here because services and pricing
 * arrive with the vendor editor, not with the application.
 */
const MAX = { name: 160, description: 2000, phone: 32, email: 160, website: 200 };

type Stage = 'checking' | 'form' | 'submitting' | 'submitted' | 'existing';

const isValidUrl = (value: string) => {
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    return Boolean(url.hostname.includes('.'));
  } catch {
    return false;
  }
};

const StatusPanel = ({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Clock;
  title: string;
  children: React.ReactNode;
}) => (
  <div className="mx-auto max-w-xl rounded-card border border-line bg-surface p-8 text-center shadow-card">
    <span className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-100">
      <Icon className="h-6 w-6" aria-hidden="true" />
    </span>
    <h2 className="text-xl font-semibold text-ink">{title}</h2>
    <div className="mt-3 text-[0.95rem] leading-relaxed text-muted">{children}</div>
  </div>
);

const BecomeVendor = () => {
  usePageMeta(
    'List your business on Ocasio',
    'Apply to list your events business on Ocasio. Applications are reviewed before a listing goes live.',
  );

  const { user, loading: authLoading, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [stage, setStage] = useState<Stage>('checking');
  const [existing, setExisting] = useState<PublicVendor | null>(null);
  const [options, setOptions] = useState<FilterOptions | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [form, setForm] = useState({
    businessName: '',
    category: '',
    location: '',
    description: '',
    phone: '',
    email: '',
    website: '',
  });

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  useEffect(() => {
    getFilterOptions()
      .then(setOptions)
      .catch(() => setOptions(null));
  }, []);

  /** An applicant who already has a vendor row sees its state, not a blank form. */
  useEffect(() => {
    let active = true;
    if (authLoading) return;

    if (!user) {
      if (active) setStage('form');
      return;
    }

    setStage('checking');
    setLoadError(null);

    getMyVendor()
      .then((vendor) => {
        if (!active) return;
        setExisting(vendor);
        setStage(vendor ? 'existing' : 'form');
      })
      .catch((e: unknown) => {
        if (!active) return;
        setLoadError(e instanceof Error ? e.message : 'Could not check your application.');
        setStage('form');
      });

    return () => {
      active = false;
    };
  }, [user, authLoading]);

  const validate = () => {
    const errors: Record<string, string> = {};

    const name = form.businessName.trim();
    if (name.length < 2) errors.businessName = 'Enter your business name (at least 2 characters).';
    else if (name.length > MAX.name) errors.businessName = `Keep this under ${MAX.name} characters.`;

    if (!form.category) errors.category = 'Choose the category that fits best.';
    if (!form.location.trim()) errors.location = 'Enter the city you work in.';

    if (form.description.length > MAX.description) {
      errors.description = `Keep this under ${MAX.description} characters.`;
    }
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      errors.email = 'Enter a valid email address.';
    }
    if (form.phone.trim() && !/^[+\d][\d\s()-]{6,}$/.test(form.phone.trim())) {
      errors.phone = 'Enter a valid phone number.';
    }
    if (form.website.trim() && !isValidUrl(form.website.trim())) {
      errors.website = 'Enter a valid website address.';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (stage === 'submitting') return;

    setSubmitError(null);
    if (!validate()) return;

    // Signed-out applicants keep their place: sign in returns here.
    if (!user) {
      navigate('/auth', { state: { from: location } });
      return;
    }

    setStage('submitting');
    try {
      const vendor = await requestVendorOnboarding(form);
      setExisting(vendor);
      // The role only becomes 'vendor' on approval, but re-reading keeps the
      // header and guards consistent with whatever the database now says.
      await refreshProfile();
      setStage('submitted');
      window.scrollTo({ top: 0 });
    } catch (e) {
      const message = e instanceof Error ? e.message : '';

      if (message === 'ALREADY_APPLIED') {
        const vendor = await getMyVendor().catch(() => null);
        setExisting(vendor);
        setStage('existing');
        return;
      }
      if (message === 'NOT_SIGNED_IN') {
        navigate('/auth', { state: { from: location } });
        return;
      }

      setSubmitError(message || "We couldn't submit your application. Please try again.");
      setStage('form');
    }
  };

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div className="bg-canvas">
      <div className="shell py-[clamp(2.5rem,5vw,4.5rem)]">
        <header className="mx-auto max-w-2xl text-center">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-brand-700">
            For vendors
          </p>
          <h1 className="mt-4 text-display-sm text-ink">List your business on Ocasio</h1>
          <p className="mt-4 text-[1.0625rem] leading-relaxed text-muted">
            Tell us about your events business. Applications are reviewed before a listing goes
            live, and listing is free — Ocasio does not charge vendors today.
          </p>
        </header>

        <div className="mt-10">{children}</div>
      </div>
    </div>
  );

  if (authLoading || stage === 'checking') {
    return (
      <Shell>
        <div className="flex justify-center py-10" role="status" aria-live="polite">
          <Loader2 className="h-6 w-6 animate-spin text-brand-600" aria-hidden="true" />
          <span className="sr-only">Checking your application…</span>
        </div>
      </Shell>
    );
  }

  if (stage === 'submitted') {
    return (
      <Shell>
        <StatusPanel icon={Check} title="Your vendor application has been submitted">
          <p>
            <strong className="font-medium text-ink">{existing?.business_name}</strong> is pending
            review. We check every application before a listing goes live, so it will not appear in
            the marketplace yet.
          </p>
          <p className="mt-3">
            You will be able to add services, pricing and photos once your application is approved.
          </p>
          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
            <ButtonLink to="/vendors">Browse the marketplace</ButtonLink>
            <ButtonLink to="/profile" variant="secondary">
              Go to your dashboard
            </ButtonLink>
          </div>
        </StatusPanel>
      </Shell>
    );
  }

  if (stage === 'existing' && existing) {
    const pending = existing.status === 'pending';
    const suspended = existing.status === 'suspended';

    return (
      <Shell>
        <StatusPanel
          icon={pending ? Clock : suspended ? ShieldCheck : Check}
          title={
            pending
              ? 'Your vendor application is under review'
              : suspended
                ? 'This listing is not currently live'
                : 'Your vendor profile is already active'
          }
        >
          <p>
            <strong className="font-medium text-ink">{existing.business_name}</strong>
            {pending && ' is waiting to be reviewed. You only need to apply once.'}
            {suspended &&
              ' is not visible in the marketplace at the moment. Contact us if you think this is a mistake.'}
            {existing.status === 'active' && ' is listed and can receive booking requests.'}
          </p>
          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
            {existing.status === 'active' ? (
              <ButtonLink to={`/vendors/${existing.slug}`}>View your listing</ButtonLink>
            ) : (
              <ButtonLink to="/vendors">Browse the marketplace</ButtonLink>
            )}
            <ButtonLink to="/contact" variant="secondary">
              Contact Ocasio
            </ButtonLink>
          </div>
        </StatusPanel>
      </Shell>
    );
  }

  return (
    <Shell>
      <form onSubmit={handleSubmit} noValidate className="mx-auto max-w-2xl">
        {loadError && (
          <div className="mb-6">
            <ErrorState message={loadError} onRetry={() => window.location.reload()} />
          </div>
        )}

        {!user && (
          <div className="mb-6">
            <Notice title="You will need an account">
              You can fill this in now. Submitting takes you to sign in, and brings you straight
              back here.
            </Notice>
          </div>
        )}

        <div className="space-y-5 rounded-card border border-line bg-surface p-6 shadow-card sm:p-8">
          <TextField
            label="Business name"
            required
            value={form.businessName}
            maxLength={MAX.name}
            error={fieldErrors.businessName}
            onChange={(e) => set('businessName')(e.target.value)}
          />

          <div className="grid gap-5 sm:grid-cols-2">
            <SelectField
              label="Category"
              required
              value={form.category}
              error={fieldErrors.category}
              onChange={(e) => set('category')(e.target.value)}
            >
              <option value="">Choose a category</option>
              {(options?.categories ?? ['Venues', 'Catering', 'Photography', 'Decoration']).map(
                (c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ),
              )}
            </SelectField>

            <TextField
              label="City"
              required
              value={form.location}
              error={fieldErrors.location}
              hint="The city you mainly work in."
              onChange={(e) => set('location')(e.target.value)}
            />
          </div>

          <TextAreaField
            label="About your business"
            rows={4}
            value={form.description}
            maxLength={MAX.description}
            error={fieldErrors.description}
            hint="What you do, and what makes your work distinctive."
            onChange={(e) => set('description')(e.target.value)}
          />

          <div className="grid gap-5 sm:grid-cols-2">
            <TextField
              label="Phone"
              type="tel"
              value={form.phone}
              maxLength={MAX.phone}
              error={fieldErrors.phone}
              onChange={(e) => set('phone')(e.target.value)}
            />
            <TextField
              label="Email"
              type="email"
              value={form.email}
              maxLength={MAX.email}
              error={fieldErrors.email}
              onChange={(e) => set('email')(e.target.value)}
            />
          </div>

          <TextField
            label="Website"
            value={form.website}
            maxLength={MAX.website}
            error={fieldErrors.website}
            hint="Optional."
            onChange={(e) => set('website')(e.target.value)}
          />

          {submitError && (
            <p className="text-sm text-red-700" role="alert">
              {submitError}
            </p>
          )}

          <div className="flex flex-col gap-3 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted">
              Reviewed before listing. No payment is taken.
            </p>
            <Button type="submit" size="lg" loading={stage === 'submitting'}>
              {stage === 'submitting'
                ? 'Submitting…'
                : user
                  ? 'Submit application'
                  : 'Sign in to submit'}
            </Button>
          </div>
        </div>
      </form>

      <p className="mx-auto mt-6 max-w-2xl text-center text-sm text-muted">
        Already applied?{' '}
        <Link to="/profile" className="font-medium text-brand-700 hover:underline">
          Check your status
        </Link>
        .
      </p>
    </Shell>
  );
};

export default BecomeVendor;
