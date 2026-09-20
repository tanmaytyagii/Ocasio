import { useEffect, useRef, useState } from 'react';
import {
  Search,
  Menu,
  X,
  Heart,
  User,
  Settings,
  LogOut,
  LayoutDashboard,
  CalendarDays,
} from 'lucide-react';
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Button, ButtonLink } from './ui';

const CATEGORIES = [
  { label: 'Venues', to: '/category/venues' },
  { label: 'Catering', to: '/category/catering' },
  { label: 'Photography', to: '/category/photography' },
  { label: 'Decoration', to: '/category/decoration' },
];

/**
 * Application header.
 *
 * One header for the whole product, including the vendor dashboard — which
 * previously rendered outside the site chrome with no navigation and no way to
 * sign out. A vendor is still an Ocasio user; they should not land somewhere
 * that looks like a different application.
 *
 * Active route state comes from NavLink rather than manual pathname
 * comparison, so it cannot drift from the router.
 */
const navLinkClass =
  (overHero: boolean) =>
  ({ isActive }: { isActive: boolean }) =>
    `relative py-1 text-sm font-medium transition-colors ${
      isActive
        ? overHero
          ? 'text-white after:absolute after:inset-x-0 after:-bottom-1 after:h-0.5 after:rounded-full after:bg-white'
          : 'text-brand-700 after:absolute after:inset-x-0 after:-bottom-1 after:h-0.5 after:rounded-full after:bg-brand-600'
        : overHero
          ? 'text-white/80 hover:text-white'
          : 'text-ink-soft hover:text-brand-700'
    }`;

const mobileLinkClass = ({ isActive }: { isActive: boolean }) =>
  `block rounded-control px-3 py-2.5 text-sm font-medium transition-colors ${
    isActive ? 'bg-brand-50 text-brand-700' : 'text-ink-soft hover:bg-canvas'
  }`;

const Navbar = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [atTop, setAtTop] = useState(true);
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

  /*
   * The header sits over the homepage hero while the page is at the top, so the
   * image runs uninterrupted to the edge of the viewport. Once scrolled — or on
   * any other route — it returns to the solid surface, because translucent
   * chrome over arbitrary page content is a readability problem rather than a
   * style.
   */
  useEffect(() => {
    const onScroll = () => setAtTop(window.scrollY < 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close overlays after navigating.
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

  // Transparent only on the homepage, only at the top, and never while the
  // mobile menu is open — that panel needs an opaque backdrop to be readable.
  const overHero = location.pathname === '/' && atTop && !mobileOpen;

  /*
   * Over the hero the header carries no background and no rule — only a trace
   * of blur, so it belongs to the photograph rather than sitting on it. The
   * hero's own top scrim is what keeps the white text legible, which means the
   * chrome itself does not have to darken anything. Past the fold it becomes a
   * proper glass surface, because translucent chrome over arbitrary page
   * content is a readability problem rather than a style.
   */
  const headerClass = overHero
    ? 'border-transparent bg-transparent backdrop-blur-[2px]'
    : 'border-line bg-surface/90 backdrop-blur-xl supports-[backdrop-filter]:bg-surface/75';

  const wordmarkClass = overHero ? 'text-white' : 'text-brand-700';
  const iconButtonClass = overHero
    ? 'text-white/90 hover:bg-white/10 hover:text-white'
    : 'text-ink-soft hover:bg-canvas hover:text-brand-700';

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 border-b transition-colors duration-300 ${headerClass}`}
    >
      <nav className="shell" aria-label="Main">
        <div className="flex h-16 items-center justify-between gap-4 lg:h-20">
          <div className="flex items-center gap-8 xl:gap-12">
            <button
              ref={mobileButtonRef}
              type="button"
              onClick={() => setMobileOpen((open) => !open)}
              aria-expanded={mobileOpen}
              aria-controls="mobile-menu"
              aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
              className={`-ml-1 rounded-control p-2 transition-colors lg:hidden ${iconButtonClass}`}
            >
              {mobileOpen ? (
                <X className="h-5 w-5" aria-hidden="true" />
              ) : (
                <Menu className="h-5 w-5" aria-hidden="true" />
              )}
            </button>

            <Link
              to="/"
              className={`text-[1.5rem] font-semibold tracking-[-0.045em] transition-colors ${wordmarkClass}`}
              aria-label="Ocasio home"
            >
              Ocasio
            </Link>

            <div className="hidden items-center gap-8 lg:flex xl:gap-9">
              <NavLink to="/vendors" className={navLinkClass(overHero)}>
                Explore
              </NavLink>
              {CATEGORIES.map((c) => (
                <NavLink key={c.to} to={c.to} className={navLinkClass(overHero)}>
                  {c.label}
                </NavLink>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <form onSubmit={handleSearch} className="relative hidden xl:block" role="search">
              <label htmlFor="navbar-search" className="sr-only">
                Search vendors
              </label>
              <input
                id="navbar-search"
                type="search"
                placeholder="Search vendors…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`h-9 w-56 rounded-full border pl-9 pr-3 text-sm transition-colors focus:border-brand-500 focus:bg-surface focus:text-ink ${
                  overHero
                    ? 'border-white/25 bg-white/10 text-white placeholder:text-white/60'
                    : 'border-line-strong bg-canvas text-ink placeholder:text-muted'
                }`}
              />
              <Search
                className={`pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${
                  overHero ? 'text-white/70' : 'text-muted'
                }`}
                aria-hidden="true"
              />
            </form>

            {user ? (
              <>
                <Link
                  to="/favorites"
                  aria-label="Saved vendors"
                  className={`rounded-control p-2 transition-colors ${iconButtonClass}`}
                >
                  <Heart className="h-5 w-5" aria-hidden="true" />
                </Link>

                <div className="relative" ref={dropdownRef}>
                  <button
                    onClick={() => setShowDropdown((open) => !open)}
                    aria-expanded={showDropdown}
                    aria-haspopup="menu"
                    aria-label="Account menu"
                    className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
                      overHero
                        ? 'bg-white/15 text-white hover:bg-white/25'
                        : 'bg-brand-50 text-brand-700 hover:bg-brand-100'
                    }`}
                  >
                    <User className="h-4 w-4" aria-hidden="true" />
                  </button>

                  {showDropdown && (
                    <div
                      role="menu"
                      className="absolute right-0 mt-2 w-60 animate-rise-in overflow-hidden rounded-card border border-line bg-surface py-1 shadow-overlay"
                    >
                      <div className="border-b border-line px-4 py-3">
                        <p className="truncate text-sm font-medium text-ink">{user.email}</p>
                        {role && (
                          <p className="mt-0.5 text-xs capitalize text-muted">{role} account</p>
                        )}
                      </div>
                      {[
                        { to: '/profile', icon: User, label: 'Dashboard' },
                        { to: '/bookings', icon: CalendarDays, label: 'My bookings' },
                        { to: '/favorites', icon: Heart, label: 'Saved vendors' },
                        { to: '/profile?tab=settings', icon: Settings, label: 'Settings' },
                      ].map(({ to, icon: Icon, label }) => (
                        <Link
                          key={label}
                          to={to}
                          role="menuitem"
                          className="flex items-center gap-2.5 px-4 py-2 text-sm text-ink-soft hover:bg-canvas"
                        >
                          <Icon className="h-4 w-4 text-muted" aria-hidden="true" />
                          {label}
                        </Link>
                      ))}
                      {role === 'vendor' && (
                        <Link
                          to="/vendor/dashboard"
                          role="menuitem"
                          className="flex items-center gap-2.5 px-4 py-2 text-sm text-ink-soft hover:bg-canvas"
                        >
                          <LayoutDashboard className="h-4 w-4 text-muted" aria-hidden="true" />
                          Vendor dashboard
                        </Link>
                      )}
                      <button
                        onClick={handleSignOut}
                        role="menuitem"
                        className="flex w-full items-center gap-2.5 border-t border-line px-4 py-2 text-left text-sm text-ink-soft hover:bg-canvas"
                      >
                        <LogOut className="h-4 w-4 text-muted" aria-hidden="true" />
                        Sign out
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <ButtonLink
                  to="/become-vendor"
                  variant="ghost"
                  size="sm"
                  className={`hidden lg:inline-flex ${
                    overHero ? 'text-white/90 hover:bg-white/10 hover:text-white' : ''
                  }`}
                >
                  List your business
                </ButtonLink>
                <ButtonLink to="/auth" size="sm">
                  Sign in
                </ButtonLink>
              </>
            )}
          </div>
        </div>
      </nav>

      {mobileOpen && (
        <div id="mobile-menu" className="animate-fade-in border-t border-line bg-surface lg:hidden">
          <div className="space-y-1 px-4 py-4">
            <form onSubmit={handleSearch} className="relative mb-3" role="search">
              <label htmlFor="mobile-search" className="sr-only">
                Search vendors
              </label>
              <input
                id="mobile-search"
                type="search"
                placeholder="Search vendors…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-11 w-full rounded-control border border-line-strong bg-canvas pl-10 pr-3 text-sm text-ink placeholder:text-muted focus:border-brand-500 focus:bg-surface"
              />
              <Search
                className={`pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${
                  overHero ? 'text-white/70' : 'text-muted'
                }`}
                aria-hidden="true"
              />
            </form>

            <NavLink to="/vendors" className={mobileLinkClass}>
              Explore all vendors
            </NavLink>
            {CATEGORIES.map((c) => (
              <NavLink key={c.to} to={c.to} className={mobileLinkClass}>
                {c.label}
              </NavLink>
            ))}

            <div className="my-2 border-t border-line" />

            {user ? (
              <>
                <NavLink to="/profile" className={mobileLinkClass}>
                  Dashboard
                </NavLink>
                <NavLink to="/bookings" className={mobileLinkClass}>
                  My bookings
                </NavLink>
                <NavLink to="/favorites" className={mobileLinkClass}>
                  Saved vendors
                </NavLink>
                {role === 'vendor' && (
                  <NavLink to="/vendor/dashboard" className={mobileLinkClass}>
                    Vendor dashboard
                  </NavLink>
                )}
                <Button variant="ghost" fullWidth onClick={handleSignOut} className="mt-1 justify-start">
                  Sign out
                </Button>
              </>
            ) : (
              <div className="space-y-2 pt-1">
                <ButtonLink to="/auth" fullWidth>
                  Sign in
                </ButtonLink>
                <ButtonLink to="/become-vendor" variant="secondary" fullWidth>
                  List your business
                </ButtonLink>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
};

export default Navbar;
