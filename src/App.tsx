import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { FavoritesProvider } from './contexts/FavoritesContext';
import { RequireAuth, RequireVendor, RequireAdmin } from './components/RouteGuards';
import ErrorBoundary from './components/ErrorBoundary';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import Home from './pages/Home';
const CategoryPage = lazy(() => import('./pages/CategoryPage'));
import VendorPage from './pages/VendorPage';
import VendorsIndex from './pages/VendorsIndex';
const SearchResults = lazy(() => import('./pages/SearchResults'));
const AboutUs = lazy(() => import('./pages/AboutUs'));
const Contact = lazy(() => import('./pages/Contact'));
const BecomeVendor = lazy(() => import('./pages/BecomeVendor'));
const Blog = lazy(() => import('./pages/Blog'));
const Profile = lazy(() => import('./pages/Profile'));
const Favorites = lazy(() => import('./pages/Favorites'));
const Bookings = lazy(() => import('./pages/Bookings'));
const BookingDetail = lazy(() => import('./pages/BookingDetail'));
const VendorDashboard = lazy(() => import('./pages/VendorDashboard'));
const Auth = lazy(() => import('./pages/Auth'));
const NotFound = lazy(() => import('./pages/NotFound'));
// Admin is lazy like every other non-home route, so the console never ships in
// the shared chunk to the customers who will never open it.
const AdminVendors = lazy(() => import('./pages/AdminVendors'));

/**
 * Route table.
 *
 * Public routes render for signed-out visitors. Before Phase 1 the entire app —
 * including the homepage — sat behind ProtectedRoute, so a first-time visitor
 * saw only a login wall: no discovery, no shareable vendor links, nothing
 * crawlable (audit BUG-10).
 *
 * Guards here are UX. Data access is enforced by Row Level Security.
 */
/**
 * Shown while a route chunk loads. Reserves height so the header does not jump
 * when the chunk arrives.
 */
const RouteFallback = () => (
  <div className="flex min-h-[60vh] items-center justify-center" role="status" aria-live="polite">
    <span className="sr-only">Loading…</span>
    <div
      className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-brand-600"
      aria-hidden="true"
    />
  </div>
);

const SiteChrome = ({ children }: { children: React.ReactNode }) => (
  <>
    {/* First tab stop on every page; visible only when focused. */}
    <a href="#main" className="skip-link">
      Skip to main content
    </a>
    <Navbar />
    <main id="main" className="flex-grow pt-16 lg:pt-20">
      {/*
        Inside the chrome, not around it: a render error in one page leaves the
        header and footer intact, so the user can navigate away instead of
        facing a blank document. Keyed on the path so moving to another route
        clears a stale error.
      */}
      <ErrorBoundary resetKey={useLocation().pathname}>{children}</ErrorBoundary>
    </main>
    <Footer />
  </>
);

function App() {
  return (
    <AuthProvider>
      <Router>
        <FavoritesProvider>
          <div className="flex min-h-screen flex-col bg-canvas">
            <Suspense fallback={<RouteFallback />}>
          <Routes>
            {/* Standalone: no site chrome. */}
            <Route path="/auth" element={<Auth />} />

            <Route
              path="/*"
              element={
                <SiteChrome>
                  <Routes>
                    {/* ---------- PUBLIC ---------- */}
                    <Route path="/" element={<Home />} />
                    <Route path="/vendors" element={<VendorsIndex />} />
                    <Route path="/vendors/:slug" element={<VendorPage />} />
                    <Route path="/category/:categoryName" element={<CategoryPage />} />
                    <Route path="/search" element={<SearchResults />} />
                    <Route path="/about" element={<AboutUs />} />
                    <Route path="/contact" element={<Contact />} />
                    <Route path="/become-vendor" element={<BecomeVendor />} />
                    <Route path="/blog" element={<Blog />} />

                    {/* Vendor workspace: same shell as the rest of the product,
                        gated on the database-backed vendor role. Declared
                        before /vendor/:slug so the static segment wins. */}
                    <Route
                      path="/vendor/dashboard/*"
                      element={
                        <RequireVendor>
                          <VendorDashboard />
                        </RequireVendor>
                      }
                    />

                    {/* Pre-Phase-1 links used /vendor/:id; keep them working. */}
                    <Route path="/vendor/:slug" element={<Navigate to="/vendors" replace />} />

                    {/* ---------- PRIVATE ---------- */}
                    <Route
                      path="/profile"
                      element={
                        <RequireAuth>
                          <Profile />
                        </RequireAuth>
                      }
                    />
                    <Route
                      path="/favorites"
                      element={
                        <RequireAuth>
                          <Favorites />
                        </RequireAuth>
                      }
                    />
                    <Route
                      path="/bookings"
                      element={
                        <RequireAuth>
                          <Bookings />
                        </RequireAuth>
                      }
                    />
                    {/* Readable by the customer and by the vendor owner; RLS
                        decides which, and anything else renders not-found. */}
                    <Route
                      path="/bookings/:id"
                      element={
                        <RequireAuth>
                          <BookingDetail />
                        </RequireAuth>
                      }
                    />

                    {/* Staff only. Not linked from any navigation; the
                        database decides what it can actually show or change. */}
                    <Route
                      path="/admin/vendors"
                      element={
                        <RequireAdmin>
                          <AdminVendors />
                        </RequireAdmin>
                      }
                    />

                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </SiteChrome>
              }
            />
            </Routes>
            </Suspense>
          </div>
        </FavoritesProvider>
      </Router>
    </AuthProvider>
  );
}

export default App;
