'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { Kbd } from '@/components/primitives/kbd';
import { createClient } from '@/lib/supabase/client';

type Props = {
  /** Pre-fill for the search input. */
  initialQuery?: string;
  /** Kept for backwards compatibility. */
  activityCount?: number;
};

type Tab = { href: string; label: string };

const PUBLIC_TABS: Tab[] = [
  { href: '/cop', label: 'Vista global' },
  { href: '/listings', label: 'Anuncis' },
];

const TENANT_TABS: Tab[] = [
  { href: '/cop', label: 'Vista global' },
  { href: '/listings', label: 'Anuncis' },
  { href: '/properties', label: 'Propietats' },
  { href: '/deals', label: 'Deals' },
  { href: '/opportunities', label: 'Oportunitats' },
];

/**
 * Top chrome bar — auth-aware analyst-console header.
 *
 * Desktop (>= md): inline tabs + search + auth area.
 * Mobile (< md):   logo + hamburger; tabs/search/auth collapse into a
 *                  full-width drawer that drops down under the header.
 *
 * The drawer is React-state controlled (no <details> trick) so we can close
 * it on route change automatically.
 */
export function TopBar({ initialQuery = '' }: Props) {
  const pathname = usePathname();
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [authResolved, setAuthResolved] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close the drawer whenever the route changes.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  // Ctrl+Space → focus search (desktop power-user keymap).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.code === 'Space') {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      setUserEmail(data.user?.email ?? '');
      setAuthResolved(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user?.email ?? '');
      setAuthResolved(true);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const isLoggedIn = authResolved && Boolean(userEmail);
  const tabs = isLoggedIn ? TENANT_TABS : PUBLIC_TABS;

  return (
    <>
      <header className="b-no-print relative z-30 border-b border-line-1 bg-bg-1 text-ink-2">
        {/* Single-row desktop layout — collapses on mobile. */}
        <div className="flex h-[44px] items-center gap-3 px-3 md:h-[38px]">
          {/* Brand — always visible */}
          <Link
            href={'/cop' as Route}
            className="flex items-center gap-2"
            aria-label="Brúixola — inici"
          >
            <span
              className="inline-block h-[7px] w-[7px] shrink-0 rounded-full bg-red"
              style={{ animation: 'livePulse 1.6s ease-in-out infinite' }}
              aria-hidden
            />
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-2">
              BRÚIXOLA
            </span>
          </Link>

          {/* Desktop tabs */}
          <nav
            aria-label="Navegació principal"
            className="hidden h-full items-stretch border-l border-line-1 pl-3 md:flex"
          >
            {tabs.map((tab) => (
              <TabLink key={tab.href} href={tab.href} pathname={pathname}>
                {tab.label}
              </TabLink>
            ))}
          </nav>

          {/* spacer */}
          <div className="flex-1" />

          {/* Desktop search */}
          <form
            action="/listings"
            method="get"
            role="search"
            className="hidden h-[26px] w-[260px] items-center gap-2 rounded-sm border border-line-2 bg-bg-2 px-2 focus-within:border-cyan-dim md:flex"
          >
            <label htmlFor="bx-search" className="sr-only">
              Cerca pisos, agents o comarques
            </label>
            <SearchIcon />
            <input
              id="bx-search"
              ref={searchRef}
              name="q"
              type="search"
              defaultValue={initialQuery}
              placeholder="Cerca pisos / agents / comarques..."
              className="flex-1 bg-transparent text-[11px] text-ink-1 placeholder:text-ink-3 focus:outline-none"
            />
            <span className="flex items-center gap-1" aria-hidden>
              <Kbd>Ctrl</Kbd>
              <Kbd>Space</Kbd>
            </span>
          </form>

          {/* Desktop auth area */}
          <div className="hidden items-center gap-3 md:flex">
            <AuthArea
              isLoggedIn={isLoggedIn}
              userEmail={userEmail}
              compact={false}
            />
          </div>

          {/* Mobile hamburger */}
          <button
            type="button"
            onClick={() => setDrawerOpen((v) => !v)}
            aria-label={drawerOpen ? 'Tanca menú' : 'Obre menú'}
            aria-expanded={drawerOpen}
            aria-controls="bx-mobile-drawer"
            className="flex h-9 w-9 items-center justify-center border border-line-2 bg-bg-2 text-ink-1 hover:border-cyan-dim md:hidden"
          >
            {drawerOpen ? <CloseIcon /> : <HamburgerIcon />}
          </button>
        </div>

        {/* Mobile drawer */}
        {drawerOpen && (
          <div
            id="bx-mobile-drawer"
            className="absolute left-0 right-0 top-full z-30 border-b border-line-1 bg-bg-1 shadow-lg md:hidden"
          >
            <nav
              aria-label="Navegació mòbil"
              className="flex flex-col divide-y divide-line-1"
            >
              {tabs.map((tab) => {
                const active =
                  pathname === tab.href ||
                  (tab.href !== '/cop' && pathname?.startsWith(tab.href)) ||
                  (tab.href === '/cop' && pathname === '/');
                return (
                  <Link
                    key={tab.href}
                    href={tab.href as Route}
                    aria-current={active ? 'page' : undefined}
                    className={clsx(
                      'min-h-[44px] px-4 py-3 font-mono text-[11px] uppercase tracking-[0.16em]',
                      active
                        ? 'bg-cyan/10 text-cyan'
                        : 'text-ink-1 hover:bg-bg-2',
                    )}
                  >
                    {tab.label}
                  </Link>
                );
              })}
            </nav>

            {/* Mobile search */}
            <form
              action="/listings"
              method="get"
              role="search"
              className="flex items-center gap-2 border-t border-line-1 px-3 py-3"
            >
              <label htmlFor="bx-search-mobile" className="sr-only">
                Cerca
              </label>
              <span className="flex h-10 flex-1 items-center gap-2 rounded-sm border border-line-2 bg-bg-2 px-3">
                <SearchIcon />
                <input
                  id="bx-search-mobile"
                  name="q"
                  type="search"
                  defaultValue={initialQuery}
                  placeholder="Cerca pisos / agents / comarques..."
                  className="flex-1 bg-transparent text-[13px] text-ink-1 placeholder:text-ink-3 focus:outline-none"
                />
              </span>
              <button
                type="submit"
                className="min-h-[40px] border border-cyan bg-cyan/15 px-3 font-mono text-[11px] uppercase tracking-[0.18em] text-cyan"
              >
                Cerca
              </button>
            </form>

            {/* Mobile auth area */}
            <div className="border-t border-line-1 px-3 py-3">
              <AuthArea
                isLoggedIn={isLoggedIn}
                userEmail={userEmail}
                compact
              />
            </div>
          </div>
        )}
      </header>

      {/* Backdrop — closes drawer on tap outside */}
      {drawerOpen && (
        <button
          type="button"
          aria-label="Tanca menú"
          onClick={() => setDrawerOpen(false)}
          className="fixed inset-0 z-20 bg-bg-0/40 backdrop-blur-[1px] md:hidden"
        />
      )}
    </>
  );
}

function AuthArea({
  isLoggedIn,
  userEmail,
  compact,
}: {
  isLoggedIn: boolean;
  userEmail: string | null;
  compact: boolean;
}) {
  if (!isLoggedIn) {
    return (
      <Link
        href={'/login' as Route}
        className={clsx(
          'border border-line-2 font-mono uppercase tracking-[0.18em] text-cyan hover:border-cyan-dim hover:text-cyan-hot',
          compact
            ? 'flex min-h-[44px] items-center justify-center px-4 text-[12px]'
            : 'px-3 py-1 text-[10px]',
        )}
      >
        Entrar
      </Link>
    );
  }
  return (
    <div
      className={clsx(
        'flex items-center',
        compact ? 'flex-col items-stretch gap-2' : 'gap-3',
      )}
    >
      <span
        title={userEmail ?? undefined}
        className={clsx(
          'truncate font-mono uppercase tracking-[0.14em] text-ink-3',
          compact
            ? 'text-[11px]'
            : 'max-w-[160px] text-[10px]',
        )}
      >
        {userEmail}
      </span>
      <div
        className={clsx(
          'flex items-center gap-2',
          compact ? 'w-full' : '',
        )}
      >
        <Link
          href={'/settings' as Route}
          className={clsx(
            'font-mono uppercase tracking-[0.18em] text-ink-2 hover:text-cyan',
            compact
              ? 'flex min-h-[44px] flex-1 items-center justify-center border border-line-2 px-3 text-[11px]'
              : 'text-[10px]',
          )}
        >
          Ajustos
        </Link>
        <form action="/auth/signout" method="post" className={compact ? 'flex-1' : ''}>
          <button
            type="submit"
            className={clsx(
              'border border-line-2 font-mono uppercase tracking-[0.18em] text-ink-2 hover:border-red-dim hover:text-red',
              compact
                ? 'min-h-[44px] w-full px-3 text-[11px]'
                : 'px-3 py-1 text-[10px]',
            )}
          >
            Sortir
          </button>
        </form>
      </div>
    </div>
  );
}

function TabLink({
  href,
  pathname,
  children,
}: {
  href: string;
  pathname: string | null;
  children: React.ReactNode;
}) {
  const active =
    pathname === href ||
    (href !== '/cop' && pathname?.startsWith(href)) ||
    (href === '/cop' && pathname === '/');

  return (
    <Link
      href={href as Route}
      aria-current={active ? 'page' : undefined}
      className={clsx(
        'relative flex items-center gap-1.5 px-3 text-[11px] uppercase tracking-[0.14em]',
        active ? 'text-cyan' : 'text-ink-2 hover:text-ink-1',
      )}
    >
      <span className="font-mono">{children}</span>
      {active && (
        <span
          className="pointer-events-none absolute inset-x-1 -bottom-px h-[2px] bg-cyan"
          aria-hidden
        />
      )}
    </Link>
  );
}

function HamburgerIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M2 4h12M2 8h12M2 12h12" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="m3 3 10 10M13 3 3 13" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      className="text-ink-3"
      aria-hidden
    >
      <circle cx="6" cy="6" r="3.5" />
      <path d="m8.6 8.6 3.4 3.4" />
    </svg>
  );
}
