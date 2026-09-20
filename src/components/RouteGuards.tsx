import { Link, Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../contexts/AuthContext';

/**
 * Route guards are UX, not security.
 *
 * They keep signed-out users from landing on a page that cannot render, and
 * send them somewhere useful. They are NOT what protects data: every query is
 * bounded by Row Level Security in Postgres, so a user who bypassed these
 * guards entirely would still read and write nothing they do not own.
 *
 * See docs/OCASIO_DATABASE.md, "Authorization model".
 */

const Centered = ({ children }: { children: ReactNode }) => (
  <div className="flex min-h-[60vh] items-center justify-center px-4">{children}</div>
);

const AuthLoading = () => (
  <Centered>
    <div className="text-center" role="status" aria-live="polite">
      <div
        className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-purple-200 border-t-purple-600"
        aria-hidden="true"
      />
      <p className="text-muted">Checking your session…</p>
    </div>
  </Centered>
);

/** Requires any signed-in user. */
export const RequireAuth = ({ children }: { children: ReactNode }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <AuthLoading />;

  // Preserve where they were going so sign-in can return them there.
  if (!user) return <Navigate to="/auth" state={{ from: location }} replace />;

  return <>{children}</>;
};

/**
 * Requires the database-backed vendor role.
 *
 * profiles.role, never user_metadata. A user who sets
 * user_metadata.user_type = 'vendor' still fails this check, and would in any
 * case be unable to read or write another vendor's rows.
 */
export const RequireVendor = ({ children }: { children: ReactNode }) => {
  const { user, role, loading } = useAuth();
  const location = useLocation();

  if (loading) return <AuthLoading />;
  if (!user) return <Navigate to="/auth" state={{ from: location }} replace />;

  if (role !== 'vendor') {
    return (
      <Centered>
        <div className="max-w-md rounded-lg border border-line bg-white p-8 text-center shadow-sm">
          <h1 className="mb-2 text-xl font-semibold text-ink">Vendor access required</h1>
          <p className="mb-6 text-muted">
            This area is for approved vendors. If you have applied, your application is still
            under review.
          </p>
          <Link
            to="/become-vendor"
            className="inline-block rounded-lg bg-brand-600 px-5 py-2.5 text-white transition-colors hover:bg-brand-700"
          >
            Become a vendor
          </Link>
        </div>
      </Centered>
    );
  }

  return <>{children}</>;
};

/**
 * Requires the database-backed admin role.
 *
 * As with RequireVendor this is UX, not security: admin_list_vendors() returns
 * an empty set and moderate_vendor() raises 42501 for anyone whose
 * public.profiles row does not say 'admin'. A user who bypassed this guard
 * would reach a console that shows them nothing and lets them change nothing.
 */
export const RequireAdmin = ({ children }: { children: ReactNode }) => {
  const { user, role, loading } = useAuth();
  const location = useLocation();

  if (loading) return <AuthLoading />;
  if (!user) return <Navigate to="/auth" state={{ from: location }} replace />;

  if (role !== 'admin') {
    return (
      <Centered>
        <div className="max-w-md rounded-card border border-line bg-surface p-8 text-center shadow-card">
          <h1 className="mb-2 text-xl font-semibold text-ink">Not available</h1>
          <p className="mb-6 text-muted">
            This area is for Ocasio staff. If you reached it by mistake, everything you need is on
            the marketplace.
          </p>
          <Link
            to="/vendors"
            className="inline-flex h-11 items-center rounded-control bg-brand-600 px-5 text-sm font-medium text-white transition-colors hover:bg-brand-700"
          >
            Browse vendors
          </Link>
        </div>
      </Centered>
    );
  }

  return <>{children}</>;
};
