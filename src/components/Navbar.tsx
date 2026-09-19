import { useEffect, useRef, useState } from 'react';
import { Search, Menu, X, Heart, User, Settings, LogOut, LayoutDashboard, CalendarDays } from 'lucide-react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const CATEGORIES = [
  { label: 'Venues', to: '/category/venues' },
  { label: 'Catering', to: '/category/catering' },
  { label: 'Photography', to: '/category/photography' },
  { label: 'Decoration', to: '/category/decoration' },
];

const Navbar = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const mobileButtonRef = useRef<HTMLButtonElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, role, signOut } = useAuth();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    navigate(`/search?q=${encodeURIComponent(searchQuery)}`);
    setMobileOpen(false);
  };

  const handleSignOut = async () => {
    await signOut();
    setShowDropdown(false);
    navigate('/');
  };

  // Close the mobile menu after navigating.
  useEffect(() => {
    setMobileOpen(false);
    setShowDropdown(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Escape closes either overlay and returns focus to the toggle.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (mobileOpen) {
        setMobileOpen(false);
        mobileButtonRef.current?.focus();
      }
      setShowDropdown(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [mobileOpen]);

  return (
    <nav className="fixed z-50 w-full bg-white shadow-sm">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 justify-between">
          <div className="flex items-center">
            <button
              ref={mobileButtonRef}
              type="button"
              onClick={() => setMobileOpen((open) => !open)}
              aria-expanded={mobileOpen}
              aria-controls="mobile-menu"
              aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
              className="rounded p-1 focus:outline-none focus:ring-2 focus:ring-purple-600 md:hidden"
            >
              {mobileOpen ? (
                <X className="h-6 w-6" aria-hidden="true" />
              ) : (
                <Menu className="h-6 w-6" aria-hidden="true" />
              )}
            </button>
            <Link to="/" className="ml-2 text-2xl font-bold text-purple-600 md:ml-0">
              Ocasio
            </Link>
          </div>

          <div className="hidden items-center space-x-8 md:flex">
            {CATEGORIES.map((c) => (
              <Link key={c.to} to={c.to} className="text-gray-700 hover:text-purple-600">
                {c.label}
              </Link>
            ))}
          </div>

          <div className="flex items-center space-x-4">
            <form onSubmit={handleSearch} className="relative hidden sm:block" role="search">
              <label htmlFor="navbar-search" className="sr-only">
                Search vendors
              </label>
              <input
                id="navbar-search"
                type="search"
                placeholder="Search vendors..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="rounded-full border py-1 pl-8 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-purple-600"
              />
              <Search
                className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 transform text-gray-400"
                aria-hidden="true"
              />
            </form>

            {user ? (
              <>
                <Link
                  to="/favorites"
                  aria-label="Saved vendors"
                  className="rounded p-1 focus:outline-none focus:ring-2 focus:ring-purple-600"
                >
                  <Heart className="h-5 w-5 text-gray-600 hover:text-purple-600" aria-hidden="true" />
                </Link>

                <div className="relative" ref={dropdownRef}>
                  <button
                    onClick={() => setShowDropdown((open) => !open)}
                    aria-expanded={showDropdown}
                    aria-haspopup="menu"
                    aria-label="Account menu"
                    className="rounded p-1 focus:outline-none focus:ring-2 focus:ring-purple-600"
                  >
                    <User className="h-5 w-5 text-gray-600 hover:text-purple-600" aria-hidden="true" />
                  </button>

                  {showDropdown && (
                    <div
                      role="menu"
                      className="absolute right-0 mt-2 w-56 rounded-lg bg-white py-1 shadow-lg ring-1 ring-black/5"
                    >
                      <div className="border-b px-4 py-2">
                        <p className="truncate text-sm font-medium text-gray-900">{user.email}</p>
                        {role && <p className="mt-0.5 text-xs capitalize text-gray-500">{role}</p>}
                      </div>
                      <Link
                        to="/profile"
                        role="menuitem"
                        className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                      >
                        <User className="mr-2 h-4 w-4" aria-hidden="true" />
                        Profile
                      </Link>
                      <Link
                        to="/bookings"
                        role="menuitem"
                        className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                      >
                        <CalendarDays className="mr-2 h-4 w-4" aria-hidden="true" />
                        My bookings
                      </Link>
                      <Link
                        to="/profile?tab=settings"
                        role="menuitem"
                        className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                      >
                        <Settings className="mr-2 h-4 w-4" aria-hidden="true" />
                        Settings
                      </Link>
                      {role === 'vendor' && (
                        <Link
                          to="/vendor/dashboard"
                          role="menuitem"
                          className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                        >
                          <LayoutDashboard className="mr-2 h-4 w-4" aria-hidden="true" />
                          Vendor dashboard
                        </Link>
                      )}
                      <button
                        onClick={handleSignOut}
                        role="menuitem"
                        className="flex w-full items-center px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
                      >
                        <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
                        Sign out
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <Link
                to="/auth"
                className="rounded-lg bg-purple-600 px-4 py-1.5 text-sm text-white transition-colors hover:bg-purple-700"
              >
                Sign in
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Mobile menu. Before Phase 1 the hamburger had no handler at all, so
          category navigation was unreachable on phones (audit BUG-9). */}
      {mobileOpen && (
        <div id="mobile-menu" className="border-t bg-white md:hidden">
          <div className="space-y-1 px-4 py-3">
            <form onSubmit={handleSearch} className="relative mb-3 sm:hidden" role="search">
              <label htmlFor="mobile-search" className="sr-only">
                Search vendors
              </label>
              <input
                id="mobile-search"
                type="search"
                placeholder="Search vendors..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-full border py-2 pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-purple-600"
              />
              <Search
                className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transform text-gray-400"
                aria-hidden="true"
              />
            </form>

            {CATEGORIES.map((c) => (
              <Link
                key={c.to}
                to={c.to}
                className="block rounded px-2 py-2 text-gray-700 hover:bg-gray-50 hover:text-purple-600"
              >
                {c.label}
              </Link>
            ))}
            <Link
              to="/vendors"
              className="block rounded px-2 py-2 text-gray-700 hover:bg-gray-50 hover:text-purple-600"
            >
              All vendors
            </Link>
            <Link
              to="/become-vendor"
              className="block rounded px-2 py-2 text-gray-700 hover:bg-gray-50 hover:text-purple-600"
            >
              Become a vendor
            </Link>
            {user && (
              <>
                <Link
                  to="/favorites"
                  className="block rounded px-2 py-2 text-gray-700 hover:bg-gray-50 hover:text-purple-600"
                >
                  Saved vendors
                </Link>
                <Link
                  to="/bookings"
                  className="block rounded px-2 py-2 text-gray-700 hover:bg-gray-50 hover:text-purple-600"
                >
                  My bookings
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
