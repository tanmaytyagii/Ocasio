import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { RequireAuth, RequireVendor } from './components/RouteGuards';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import Chatbot from './components/Chatbot';
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
    <Navbar />
    <main className="flex-grow">{children}</main>
    <Chatbot />
    <Footer />
  </>
);

function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="flex min-h-screen flex-col bg-white">
          <Routes>
            {/* Standalone: no site chrome. */}
            <Route path="/auth" element={<Auth />} />

            {/* Vendor workspace: requires the database-backed vendor role. */}
            <Route
              path="/vendor/dashboard/*"
              element={
                <RequireVendor>
                  <VendorDashboard />
                </RequireVendor>
              }
            />

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

                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </SiteChrome>
              }
            />
          </Routes>
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;
