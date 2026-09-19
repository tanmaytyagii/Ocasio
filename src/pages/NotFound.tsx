import { Link } from 'react-router-dom';

const NotFound = () => (
  <div className="flex min-h-[60vh] items-center justify-center px-4">
    <div className="text-center">
      <p className="text-sm font-semibold uppercase tracking-wide text-purple-600">404</p>
      <h1 className="mt-2 text-3xl font-bold text-gray-900">Page not found</h1>
      <p className="mt-3 text-gray-600">
        That page does not exist. It may have moved, or the link may be out of date.
      </p>
      <div className="mt-8 flex justify-center gap-3">
        <Link
          to="/"
          className="rounded-lg bg-purple-600 px-5 py-2.5 text-white transition-colors hover:bg-purple-700"
        >
          Back to home
        </Link>
        <Link
          to="/vendors"
          className="rounded-lg border border-gray-300 px-5 py-2.5 text-gray-700 transition-colors hover:bg-gray-50"
        >
          Browse vendors
        </Link>
      </div>
    </div>
  </div>
);

export default NotFound;
