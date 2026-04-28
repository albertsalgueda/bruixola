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
  /**
   * Kept for backwards compatibility with existing call sites that still
   * pass an Activitat-tab badge count. Currently unused — the Activitat tab
   * was removed from the public chrome during the multi-tenant pivot.
   */
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
 * Logged-out: only the public "Vista global" tab + ENTRAR.
 * Logged-in: full tenant nav + email · ajustos · sortir.
 *
 * The 6-icon toolbar that used to sit between the brand and the tabs was
 * dropped — most of its targets were dead (Capes was a no-op, /listings was
 * empty after the multi-tenant data wipe, /pipeline was superseded by /deals).
 * The remaining real navigation is the tab strip + the search input.
 */
export function TopBar({ initialQuery = '' }: Props) {
  const pathname = usePathname();
  const searchRef = useRef<HTMLInputElement | null>(null);
  // null = unknown (still resolving); string = logged-in email; '' = guest.
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [authResolved, setAuthResolved] = useState(false);

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
  // Render the public tab set during the brief unresolved window so the
  // chrome doesn't flash extra tabs before the auth probe completes.
  const tabs = isLoggedIn ? TENANT_TABS : PUBLIC_TABS;

  return (
    <header
      className="b-no-print grid h-[38px] items-center border-b border-line-1 bg-bg-1 px-3 text-ink-2"
      style={{
        gridTemplateColumns: 'auto auto 1fr auto auto',
        columnGap: '14px',
      }}
    >
      {/* live indicator + brand */}
      <div className="flex items-center gap-2">
        <span
          className="inline-block h-[7px] w-[7px] rounded-full bg-red"
          style={{ animation: 'livePulse 1.6s ease-in-out infinite' }}
          aria-hidden
        />
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-2">
          BRÚIXOLA
        </span>
      </div>

      {/* tabs — auth-aware */}
      <nav
        aria-label="Navegació principal"
        className="flex h-full items-stretch border-l border-line-1 pl-3"
      >
        {tabs.map((tab) => (
          <TabLink key={tab.href} href={tab.href} pathname={pathname}>
            {tab.label}
          </TabLink>
        ))}
      </nav>

      {/* spacer */}
      <div />

      {/* search */}
      <form
        action="/listings"
        method="get"
        role="search"
        className="flex h-[26px] w-[260px] items-center gap-2 rounded-sm border border-line-2 bg-bg-2 px-2 focus-within:border-cyan-dim"
      >
        <label htmlFor="bx-search" className="sr-only">
          Cerca pisos, agents o comarques
        </label>
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

      {/* auth area */}
      {isLoggedIn ? (
        <div className="ml-1 flex items-center gap-3">
          <span
            title={userEmail ?? undefined}
            className="max-w-[160px] truncate font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3"
          >
            {userEmail}
          </span>
          <Link
            href={'/settings' as Route}
            className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-2 hover:text-cyan"
          >
            Ajustos
          </Link>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="border border-line-2 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-2 hover:border-red-dim hover:text-red"
            >
              Sortir
            </button>
          </form>
        </div>
      ) : (
        <Link
          href={'/login' as Route}
          className="ml-1 border border-line-2 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-cyan hover:border-cyan-dim hover:text-cyan-hot"
        >
          Entrar
        </Link>
      )}
    </header>
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
