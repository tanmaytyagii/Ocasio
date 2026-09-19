import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { FavoritesProvider } from './contexts/FavoritesContext';
import { RequireAuth, RequireVendor } from './components/RouteGuards';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import Home from './pages/Home';
import CategoryPage from './pages/CategoryPage';
import VendorPage from './pages/VendorPage';
import VendorsIndex from './pages/VendorsIndex';
import SearchResults from './pages/SearchResults';
import AboutUs from './pages/AboutUs';
import Contact from './pages/Contact';
import BecomeVendor from './pages/BecomeVendor';
import Blog from './pages/Blog';
import Profile from './pages/Profile';
import Favorites from './pages/Favorites';
import Bookings from './pages/Bookings';
import BookingDetail from './pages/BookingDetail';
import VendorDashboard from './pages/VendorDashboard';
import Auth from './pages/Auth';
import NotFound from './pages/NotFound';

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
const SiteChrome = ({ children }: { children: React.ReactNode }) => (
  <>
    {/* First tab stop on every page; visible only when focused. */}
    <a href="#main" className="skip-link">
      Skip to main content
    </a>
    <Navbar />
    <main id="main" className="flex-grow pt-16">
      {children}
    </main>
    <Footer />
  </>
);

function App() {
  return (
    <AuthProvider>
      <Router>
        <FavoritesProvider>
          <div className="flex min-h-screen flex-col bg-white">
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

                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </SiteChrome>
              }
            />
            </Routes>
          </div>
        </FavoritesProvider>
      </Router>
    </AuthProvider>
  );
}

export default App;
