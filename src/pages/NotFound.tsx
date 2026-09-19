import { Link } from 'react-router-dom';

const NotFound = () => (
  <div className="flex min-h-[60vh] items-center justify-center px-4">
    <div className="text-center">
      <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">404</p>
      <h1 className="mt-2 text-3xl font-bold text-ink">Page not found</h1>
      <p className="mt-3 text-muted">
        That page does not exist. It may have moved, or the link may be out of date.
      </p>
      <div className="mt-8 flex justify-center gap-3">
        <Link
          to="/"
          className="rounded-lg bg-brand-600 px-5 py-2.5 text-white transition-colors hover:bg-brand-700"
        >
          Back to home
        </Link>
        <Link
          to="/vendors"
          className="rounded-lg border border-line-strong px-5 py-2.5 text-ink-soft transition-colors hover:bg-canvas"
        >
          Browse vendors
        </Link>
      </div>
    </div>
  </div>
);

export default NotFound;
