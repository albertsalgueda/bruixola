'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import clsx from 'clsx';
import { Kbd } from '@/components/primitives/kbd';

type Props = {
  /** Defaults to 0. The "Activitat" tab badge — usually count of last-24h listings. */
  activityCount?: number;
  /** Defaults to "" — the search input pre-fills with this when present. */
  initialQuery?: string;
};

/**
 * Top chrome bar — the analyst-console header.
 *
 * Live, interactive:
 *  - 3 tabs route via next/link with `usePathname()` driving the active state.
 *  - Search bar is a real <form action="/listings" method="get"> with name="q".
 *  - Ctrl+Space focuses the search input.
 *  - 6 toolbar icons each lead somewhere; the search icon focuses the input.
 *
 * Visual register stays Palantir-cool: cool-dark, cyan, sans-only typography.
 */
export function TopBar({ activityCount = 0, initialQuery = '' }: Props) {
  const pathname = usePathname();
  const searchRef = useRef<HTMLInputElement | null>(null);

  // Ctrl+Space → focus search.
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

  return (
    <header
      className="b-no-print grid h-[38px] items-center border-b border-line-1 bg-bg-1 px-3 text-ink-2"
      style={{
        gridTemplateColumns: 'auto auto auto 1fr auto',
        columnGap: '14px',
      }}
    >
      {/* live indicator */}
      <div className="flex items-center gap-2">
        <span
          className="inline-block h-[7px] w-[7px] rounded-full bg-red"
          style={{
            animation: 'livePulse 1.6s ease-in-out infinite',
          }}
          aria-hidden
        />
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-2">
          1 spectador
        </span>
      </div>

      {/* toolbar — 6 monochrome icons that all do something */}
      <nav
        className="flex items-center gap-3 border-l border-line-1 pl-3"
        aria-label="Toolbar"
      >
        <ToolLink href="/cop" label="Vista global">
          <circle cx="7" cy="7" r="5.5" />
          <path d="M1.5 7h11M7 1.5c2 1.6 2 9.4 0 11M7 1.5c-2 1.6-2 9.4 0 11" />
        </ToolLink>
        <ToolLink href="/cop?layers=open" label="Capes">
          <path d="M7 1.5 1.5 4.5 7 7.5l5.5-3z" />
          <path d="m1.5 7.5 5.5 3 5.5-3" />
          <path d="m1.5 10.5 5.5 3 5.5-3" />
        </ToolLink>
        <ToolLink href="/listings" label="Filtre">
          <path d="M1.5 2h11l-4.2 5v4.5L5.7 13V7z" />
        </ToolLink>
        <ToolLink href="/strategies" label="Connectar senyals">
          <circle cx="3" cy="7" r="1.6" />
          <circle cx="11" cy="3.5" r="1.6" />
          <circle cx="11" cy="10.5" r="1.6" />
          <path d="M4.4 6.3 9.6 4.2M4.4 7.7l5.2 2.1" />
        </ToolLink>
        <ToolLink href="/pipeline" label="Pipeline">
          <path d="M1.5 3.5h7M1.5 7h11M1.5 10.5h5" />
          <circle cx="10" cy="3.5" r="1.4" />
          <circle cx="8" cy="10.5" r="1.4" />
        </ToolLink>
        <ToolButton
          label="Cerca"
          onClick={() => {
            searchRef.current?.focus();
            searchRef.current?.select();
          }}
        >
          <circle cx="6" cy="6" r="3.5" />
          <path d="m8.6 8.6 3.4 3.4" />
        </ToolButton>
      </nav>

      {/* tabs */}
      <div className="flex h-full items-stretch border-l border-line-1 pl-3">
        <Tab href="/cop" pathname={pathname}>Vista global</Tab>
        <Tab href="/pipeline" pathname={pathname}>Pipeline</Tab>
        <Tab
          href="/activity"
          pathname={pathname}
          badge={activityCount > 0 ? String(activityCount) : undefined}
        >
          Activitat
        </Tab>
      </div>

      {/* spacer */}
      <div />

      {/* search */}
      <form
        action="/listings"
        method="get"
        className="flex h-[26px] w-[260px] items-center gap-2 rounded-sm border border-line-2 bg-bg-2 px-2 focus-within:border-cyan-dim"
      >
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
          ref={searchRef}
          name="q"
          type="search"
          defaultValue={initialQuery}
          placeholder="Cerca pisos / agents / comarques..."
          aria-label="Cerca"
          className="flex-1 bg-transparent text-[11px] text-ink-1 placeholder:text-ink-3 focus:outline-none"
        />
        <span className="flex items-center gap-1">
          <Kbd>Ctrl</Kbd>
          <Kbd>Space</Kbd>
        </span>
      </form>
    </header>
  );
}

function ToolLink({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href as Route}
      title={label}
      aria-label={label}
      className="flex h-6 w-6 items-center justify-center text-ink-3 transition-colors hover:text-ink-0"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 14 14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        {children}
      </svg>
    </Link>
  );
}

function ToolButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="flex h-6 w-6 items-center justify-center text-ink-3 transition-colors hover:text-ink-0"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 14 14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        {children}
      </svg>
    </button>
  );
}

function Tab({
  href,
  pathname,
  children,
  badge,
}: {
  href: string;
  pathname: string | null;
  children: React.ReactNode;
  badge?: string;
}) {
  const active =
    pathname === href ||
    (href !== '/cop' && pathname?.startsWith(href)) ||
    (href === '/cop' && pathname === '/');

  return (
    <Link
      href={href as Route}
      className={clsx(
        'relative flex items-center gap-1.5 px-3 text-[11px] uppercase tracking-[0.14em]',
        active ? 'text-cyan' : 'text-ink-2 hover:text-ink-1',
      )}
    >
      <span className="font-mono">{children}</span>
      {badge && (
        <span className="ml-2 rounded-full bg-bg-3 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-ink-2">
          {badge}
        </span>
      )}
      {active && (
        <span
          className="pointer-events-none absolute inset-x-1 -bottom-px h-[2px] bg-cyan"
          aria-hidden
        />
      )}
    </Link>
  );
}
