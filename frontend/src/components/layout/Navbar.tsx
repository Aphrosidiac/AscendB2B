'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import {
  ShoppingCart,
  Menu,
  X,
  Search,
  ChevronDown,
  Package,
  FileText,
  Receipt,
  MapPin,
  LogOut,
} from 'lucide-react';
import { useCart } from '@/lib/cart';
import { useCompanyAuth } from '@/hooks/useCompanyAuth';
import { CREDIT_TERMS_LABELS } from '@/lib/constants';
import { PriceLadder } from '@/components/ui/PriceLadder';

const EASE = 'cubic-bezier(0.16,1,0.3,1)';

// Catalogue navigation only. Account destinations used to be mixed in here
// ("Sign In", "Account", "My Orders" as peer links beside Products), which
// both cluttered the row and meant a logged-out visitor was offered three
// routes to the same two auth pages — a text link, a User icon, and the trade
// CTA. Auth now lives entirely in the right-hand cluster.
const NAV_LINKS = [
  { href: '/products', label: 'Products' },
  { href: '/kits', label: 'Kits' },
  { href: '/about', label: 'About' },
];

// The daily surfaces for a signed-in trade buyer. Previously all of these were
// only reachable by first landing on /account.
const ACCOUNT_LINKS = [
  { href: '/account/orders', label: 'Orders', Icon: Package },
  { href: '/account/quotations', label: 'Quotations', Icon: FileText },
  { href: '/account/invoices', label: 'Invoices', Icon: Receipt },
  { href: '/account/addresses', label: 'Addresses', Icon: MapPin },
];

export function Navbar() {
  const { itemCount } = useCart();
  const { isAuthenticated, company, logout } = useCompanyAuth();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  // menuOpen is the logical on/off state; menuMounted keeps the overlay in
  // the DOM for the exit transition's duration after menuOpen flips false,
  // and menuVisible is flipped a frame after mount so the entrance
  // transition actually has a "from" state to animate out of.
  const [menuMounted, setMenuMounted] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [acctOpen, setAcctOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const acctRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (searchOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [searchOpen]);

  // Dismiss the account dropdown on an outside click or Escape. Bound only
  // while it's actually open so the listeners aren't live for the whole
  // session.
  useEffect(() => {
    if (!acctOpen) return;
    const onDown = (e: MouseEvent) => {
      if (acctRef.current && !acctRef.current.contains(e.target as Node)) setAcctOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAcctOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [acctOpen]);

  useEffect(() => {
    if (menuOpen) {
      setMenuMounted(true);
      // A single rAF isn't enough: it can fire before the browser has ever
      // painted the just-mounted "closed" frame, so the transition has no
      // starting point to animate from and the menu simply pops in. Waiting
      // two frames guarantees the closed state actually painted first.
      let raf2 = 0;
      const raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => setMenuVisible(true));
      });
      return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2); };
    }
    setMenuVisible(false);
    const timeout = setTimeout(() => setMenuMounted(false), 500);
    return () => clearTimeout(timeout);
  }, [menuOpen]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/products?search=${encodeURIComponent(searchQuery.trim())}`);
      setSearchOpen(false);
      setSearchQuery('');
    }
  };

  const closeSearch = () => {
    setSearchOpen(false);
    setSearchQuery('');
  };

  const handleLogout = () => {
    setAcctOpen(false);
    setMenuOpen(false);
    logout();
    router.push('/');
  };

  return (
    <>
    <nav className="sticky top-0 z-50 bg-surface/95 backdrop-blur border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Lockup carries the "Trade Supply" qualifier — the header was
              indistinguishable from the retail storefront's, on a site where
              every price and term is trade-only. */}
          <Link href="/" className="flex items-center gap-2.5 shrink-0">
            <Image src="/images/pill-icon.png" alt="" width={30} height={30} />
            <span className={searchOpen ? 'hidden sm:block' : ''}>
              <span className="block font-display font-bold text-xl tracking-tight leading-none">
                ASCEND
              </span>
              <span className="hidden sm:block text-[10px] font-medium uppercase tracking-[0.16em] text-text-muted leading-none mt-0.5">
                Trade Supply
              </span>
            </span>
          </Link>

          {/* Center: nav links, or the search field once opened. */}
          <div className="flex-1 flex justify-center mx-4">
            {searchOpen ? (
              <form onSubmit={handleSearch} className="w-full max-w-md animate-search-expand">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                  <input
                    ref={inputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by code or compound..."
                    className="w-full pl-10 pr-10 py-2 rounded-full border border-border bg-surface-elevated text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    onKeyDown={(e) => { if (e.key === 'Escape') closeSearch(); }}
                  />
                  <button
                    type="button"
                    onClick={closeSearch}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-border rounded-full transition-colors cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5 text-text-muted" />
                  </button>
                </div>
              </form>
            ) : (
              <div className="hidden md:flex items-center gap-8">
                {NAV_LINKS.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="text-sm font-medium text-text-secondary hover:text-text-primary transition-colors"
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            {!searchOpen && (
              <button
                onClick={() => { setSearchOpen(true); setMenuOpen(false); setAcctOpen(false); }}
                className="p-3 hover:bg-surface-elevated rounded-lg transition-colors cursor-pointer"
                aria-label="Search"
              >
                <Search className="w-5 h-5" />
              </button>
            )}

            <Link href="/cart" className="relative p-3 hover:bg-surface-elevated rounded-lg transition-colors" aria-label="Cart">
              <ShoppingCart className="w-5 h-5" />
              {itemCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-primary text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-medium">
                  {itemCount}
                </span>
              )}
            </Link>

            {!searchOpen && !isAuthenticated && (
              <>
                <Link
                  href="/login"
                  className="hidden sm:inline-flex items-center px-3 py-2 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors"
                >
                  Sign in
                </Link>
                <Link
                  href="/signup"
                  className="hidden lg:inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-light transition-colors"
                >
                  Apply for account
                </Link>
              </>
            )}

            {/* Signed in: show who you are and what terms you're on, rather
                than an anonymous person icon. The header is the only place a
                buyer can confirm which account they're ordering against. */}
            {!searchOpen && isAuthenticated && (
              <div className="relative hidden sm:block" ref={acctRef}>
                <button
                  onClick={() => setAcctOpen((o) => !o)}
                  aria-expanded={acctOpen}
                  aria-haspopup="menu"
                  className="flex items-center gap-2 rounded-lg border border-border pl-3 pr-2 py-1.5 hover:border-border-hover hover:bg-surface-elevated transition-colors cursor-pointer max-w-[220px]"
                >
                  <span className="min-w-0 text-left">
                    <span className="block text-sm font-medium truncate">
                      {company?.name ?? 'Account'}
                    </span>
                    {company && (
                      <span className="block text-[11px] text-text-muted leading-none">
                        {CREDIT_TERMS_LABELS[company.creditTerms] ?? company.creditTerms}
                      </span>
                    )}
                  </span>
                  <ChevronDown
                    className={`w-4 h-4 text-text-muted shrink-0 transition-transform ${acctOpen ? 'rotate-180' : ''}`}
                  />
                </button>

                {acctOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 mt-2 w-56 rounded-xl border border-border bg-surface shadow-lg overflow-hidden"
                  >
                    {ACCOUNT_LINKS.map(({ href, label, Icon }) => (
                      <Link
                        key={href}
                        href={href}
                        role="menuitem"
                        onClick={() => setAcctOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-text-secondary hover:bg-surface-elevated hover:text-text-primary transition-colors"
                      >
                        <Icon className="w-4 h-4 text-text-muted shrink-0" />
                        {label}
                      </Link>
                    ))}
                    <Link
                      href="/account"
                      role="menuitem"
                      onClick={() => setAcctOpen(false)}
                      className="block px-4 py-2.5 text-sm text-text-secondary hover:bg-surface-elevated hover:text-text-primary transition-colors border-t border-border"
                    >
                      Account settings
                    </Link>
                    <button
                      role="menuitem"
                      onClick={handleLogout}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-text-secondary hover:bg-surface-elevated hover:text-danger transition-colors border-t border-border cursor-pointer"
                    >
                      <LogOut className="w-4 h-4 text-text-muted shrink-0" />
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            )}

            {!searchOpen && (
              <button
                onClick={() => { setMenuOpen(!menuOpen); setAcctOpen(false); }}
                className="md:hidden p-3 hover:bg-surface-elevated rounded-lg transition-colors cursor-pointer"
                aria-label={menuOpen ? 'Close menu' : 'Open menu'}
                aria-expanded={menuOpen}
              >
                {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            )}
          </div>
        </div>
      </div>
    </nav>

    {/* Full-screen mobile menu — rendered as a sibling of <nav>, not a
        descendant: <nav> has backdrop-blur, and a backdrop-filter ancestor
        becomes the containing block for position:fixed children, which
        would confine this overlay to the nav's own (short) bounding box
        instead of the viewport. */}
    {menuMounted && (
        <div
          role="dialog"
          aria-modal="true"
          className="md:hidden fixed inset-0 z-[100] bg-primary overflow-hidden transition-opacity duration-500"
          style={{ transitionTimingFunction: EASE, opacity: menuVisible ? 1 : 0 }}
        >
          {/* Same ladder motif as the hero, not the retail site's molecular
              network. */}
          <PriceLadder className="absolute inset-0 w-full h-full" />

          <div
            className="relative z-10 flex flex-col h-full transition-transform duration-500"
            style={{ transitionTimingFunction: EASE, transform: menuVisible ? 'translateY(0)' : 'translateY(-16px)' }}
          >
            <div className="flex items-center justify-between h-16 px-4 sm:px-6 lg:px-8 shrink-0">
              <Link href="/" className="flex items-center gap-2.5" onClick={() => setMenuOpen(false)}>
                <Image src="/images/pill-icon.png" alt="" width={30} height={30} className="invert" />
                <span>
                  <span className="block font-display font-bold text-xl tracking-tight text-white leading-none">
                    ASCEND
                  </span>
                  <span className="block text-[10px] font-medium uppercase tracking-[0.16em] text-white/50 leading-none mt-0.5">
                    Trade Supply
                  </span>
                </span>
              </Link>
              <button
                onClick={() => setMenuOpen(false)}
                aria-label="Close menu"
                className="p-3 hover:bg-white/10 rounded-lg transition-colors cursor-pointer text-white"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <nav className="flex-1 flex flex-col justify-center px-8 sm:px-12 overflow-y-auto">
              {NAV_LINKS.map((link, i) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMenuOpen(false)}
                  className="py-4 border-b border-white/10 font-display text-3xl font-bold text-white transition-all duration-500"
                  style={{
                    transitionTimingFunction: EASE,
                    transitionDelay: menuVisible ? `${120 + i * 70}ms` : '0ms',
                    opacity: menuVisible ? 1 : 0,
                    transform: menuVisible ? 'translateX(0)' : 'translateX(24px)',
                  }}
                >
                  {link.label}
                </Link>
              ))}

              {/* Account destinations are a distinct group at a smaller size —
                  they aren't catalogue navigation and shouldn't compete with
                  it typographically. */}
              {isAuthenticated && (
                <div
                  className="mt-8 transition-all duration-500"
                  style={{
                    transitionTimingFunction: EASE,
                    transitionDelay: menuVisible ? `${120 + NAV_LINKS.length * 70}ms` : '0ms',
                    opacity: menuVisible ? 1 : 0,
                    transform: menuVisible ? 'translateX(0)' : 'translateX(24px)',
                  }}
                >
                  {company && (
                    <p className="text-white/50 text-xs uppercase tracking-wider mb-3">
                      {company.name} &middot;{' '}
                      {CREDIT_TERMS_LABELS[company.creditTerms] ?? company.creditTerms}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-x-5 gap-y-2">
                    {[...ACCOUNT_LINKS, { href: '/account', label: 'Settings', Icon: null }].map(
                      ({ href, label }) => (
                        <Link
                          key={href}
                          href={href}
                          onClick={() => setMenuOpen(false)}
                          className="text-white/80 hover:text-white text-base font-medium transition-colors"
                        >
                          {label}
                        </Link>
                      )
                    )}
                  </div>
                </div>
              )}
            </nav>

            <div
              className="px-8 sm:px-12 pb-10 shrink-0 transition-all duration-500"
              style={{
                transitionTimingFunction: EASE,
                transitionDelay: menuVisible ? `${190 + NAV_LINKS.length * 70}ms` : '0ms',
                opacity: menuVisible ? 1 : 0,
                transform: menuVisible ? 'translateY(0)' : 'translateY(16px)',
              }}
            >
              {isAuthenticated ? (
                <button
                  onClick={handleLogout}
                  className="mb-5 flex w-full items-center justify-center gap-2 rounded-lg border border-white/25 px-5 py-3 font-medium text-white hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <LogOut className="w-4 h-4" /> Sign out
                </button>
              ) : (
                <>
                  <Link
                    href="/signup"
                    onClick={() => setMenuOpen(false)}
                    className="mb-3 flex items-center justify-center rounded-lg bg-white px-5 py-3 font-display font-bold text-primary hover:bg-white/90 transition-colors"
                  >
                    Apply for a Trade Account
                  </Link>
                  <Link
                    href="/login"
                    onClick={() => setMenuOpen(false)}
                    className="mb-5 flex items-center justify-center rounded-lg border border-white/25 px-5 py-3 font-medium text-white hover:bg-white/10 transition-colors"
                  >
                    Sign in
                  </Link>
                </>
              )}
              <p className="text-white/50 text-sm">Wholesale Research Peptides &middot; Malaysia</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
