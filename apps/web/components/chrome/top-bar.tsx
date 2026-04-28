import { Kbd } from '@/components/primitives/kbd';

/**
 * Top chrome bar — the analyst-console header.
 *
 * Pure presentational server component. The toolbar buttons, tabs, and
 * search are visual scaffold for now; interactivity (filter panel, search,
 * tab routing) lands in a later wave. Layout is a single row at 38px high,
 * grid laid out: live-dot · toolbar · tabs · flex-grow · search · window-controls.
 *
 * Icons are inline 14px monochrome SVGs — no icon library dependency to keep
 * the bundle tight and the visual register tightly controlled.
 */
export function TopBar() {
  return (
    <header
      className="grid h-[38px] items-center border-b border-line-1 bg-bg-1 px-3 text-ink-2"
      style={{
        gridTemplateColumns: 'auto auto auto 1fr auto auto',
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

      {/* toolbar — 8 monochrome icons */}
      <nav
        className="flex items-center gap-3 border-l border-line-1 pl-3"
        aria-label="Toolbar"
      >
        <ToolIcon label="Vista global">
          <circle cx="7" cy="7" r="5.5" />
          <path d="M1.5 7h11M7 1.5c2 1.6 2 9.4 0 11M7 1.5c-2 1.6-2 9.4 0 11" />
        </ToolIcon>
        <ToolIcon label="Replay">
          <path d="M3 7a4 4 0 1 1 1.2 2.85" />
          <path d="M3 4v3h3" />
        </ToolIcon>
        <ToolIcon label="Reproduir">
          <path d="M4 2.5v9l7-4.5z" />
        </ToolIcon>
        <ToolIcon label="Capes">
          <path d="M7 1.5 1.5 4.5 7 7.5l5.5-3z" />
          <path d="m1.5 7.5 5.5 3 5.5-3" />
          <path d="m1.5 10.5 5.5 3 5.5-3" />
        </ToolIcon>
        <ToolIcon label="Filtre">
          <path d="M1.5 2h11l-4.2 5v4.5L5.7 13V7z" />
        </ToolIcon>
        <ToolIcon label="Connectar">
          <circle cx="3" cy="7" r="1.6" />
          <circle cx="11" cy="3.5" r="1.6" />
          <circle cx="11" cy="10.5" r="1.6" />
          <path d="M4.4 6.3 9.6 4.2M4.4 7.7l5.2 2.1" />
        </ToolIcon>
        <ToolIcon label="Pipeline">
          <path d="M1.5 3.5h7M1.5 7h11M1.5 10.5h5" />
          <circle cx="10" cy="3.5" r="1.4" />
          <circle cx="8" cy="10.5" r="1.4" />
        </ToolIcon>
        <ToolIcon label="Cerca">
          <circle cx="6" cy="6" r="3.5" />
          <path d="m8.6 8.6 3.4 3.4" />
        </ToolIcon>
      </nav>

      {/* tabs */}
      <div className="flex h-full items-stretch border-l border-line-1 pl-3">
        <Tab active>Vista global</Tab>
        <Tab>Pipeline</Tab>
        <Tab badge="14">Activitat</Tab>
      </div>

      {/* spacer */}
      <div />

      {/* search */}
      <div className="flex h-[26px] w-[260px] items-center gap-2 rounded-sm border border-line-2 bg-bg-2 px-2">
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
          type="search"
          placeholder="Cerca pisos / agents / comarques..."
          className="flex-1 bg-transparent text-[11px] text-ink-1 placeholder:text-ink-3 focus:outline-none"
          // disabled until wave with search wiring
          readOnly
        />
        <span className="flex items-center gap-1">
          <Kbd>Ctrl</Kbd>
          <Kbd>Space</Kbd>
        </span>
      </div>

      {/* macOS-style window controls (visual only) */}
      <div className="flex items-center gap-1.5 border-l border-line-1 pl-3 text-ink-3">
        <WindowDot label="Minimitzar" symbol="—" />
        <WindowDot label="Maximitzar" symbol="□" />
        <WindowDot label="Tancar" symbol="×" />
      </div>
    </header>
  );
}

function ToolIcon({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
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
    </button>
  );
}

function Tab({
  children,
  active = false,
  badge,
}: {
  children: React.ReactNode;
  active?: boolean;
  badge?: string;
}) {
  return (
    <div
      className={[
        'relative flex items-center gap-1.5 px-3 text-[11px] uppercase tracking-[0.14em]',
        active ? 'text-cyan' : 'text-ink-2 hover:text-ink-1',
      ].join(' ')}
    >
      <span className="font-mono">{children}</span>
      {badge && (
        <span className="font-mono text-[9px] text-ink-3">{badge}</span>
      )}
      {active && (
        <span
          className="pointer-events-none absolute inset-x-1 -bottom-px h-[2px] bg-cyan"
          aria-hidden
        />
      )}
    </div>
  );
}

function WindowDot({ label, symbol }: { label: string; symbol: string }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className="flex h-4 w-4 items-center justify-center font-mono text-[11px] leading-none text-ink-3 transition-colors hover:text-ink-0"
    >
      {symbol}
    </button>
  );
}
