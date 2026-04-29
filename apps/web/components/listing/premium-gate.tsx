'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { usePathname } from 'next/navigation';

/**
 * PremiumGate — wrap any premium intelligence section.
 *
 * Logged-in tenants see content normally.
 * Anonymous visitors see content blurred + a CTA chip; clicking opens a
 * paywall modal with login / signup links.
 *
 * Decision: keep premium content in the rendered HTML even when locked
 * (just visually obscured) so SEO + a11y still pick it up. The blur is a
 * presentational signal, not a security boundary — the actual gating still
 * happens at write-paths via Supabase RLS. For numeric data we want truly
 * hidden, that lives behind a tenant-only RPC; this component handles the
 * UI tier only.
 */
export function PremiumGate({
  locked,
  children,
  label = 'Anàlisi premium',
  reason,
}: {
  locked: boolean;
  children: ReactNode;
  label?: string;
  reason?: string;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname() ?? '/';

  if (!locked) return <>{children}</>;

  return (
    <div className="relative">
      <div
        aria-hidden="true"
        className="pointer-events-none select-none blur-[6px] saturate-50 opacity-70"
      >
        {children}
      </div>

      {/* Overlay CTA — absolute, centred over the blurred block */}
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group flex items-center gap-3 rounded-sm border border-cyan bg-bg-1/95 px-4 py-2.5 backdrop-blur-sm hover:border-cyan-hot focus:outline-none focus:ring-2 focus:ring-cyan"
        >
          <span aria-hidden="true" className="font-mono text-cyan">
            ✦
          </span>
          <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-cyan group-hover:text-cyan-hot">
            {label}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3">
            · accés Brúixola
          </span>
        </button>
      </div>

      {/* Modal */}
      {open && <PaywallModal onClose={() => setOpen(false)} returnTo={pathname} reason={reason} />}
    </div>
  );
}

function PaywallModal({
  onClose,
  returnTo,
  reason,
}: {
  onClose: () => void;
  returnTo: string;
  reason?: string;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="paywall-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg-0/85 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-sm border border-cyan-dim bg-bg-1 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-cyan">
            ✦ Brúixola
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tancar"
            className="font-mono text-[14px] text-ink-3 hover:text-ink-1"
          >
            ✕
          </button>
        </div>

        <h2
          id="paywall-title"
          className="font-display text-[22px] font-medium leading-tight tracking-tight text-ink-0"
        >
          Accés a l'anàlisi completa
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-2">
          La valoració, la tesi d'inversió, els comparables, el risc i el sostre
          legal SERPAVI estan disponibles per a usuaris registrats.
          {reason ? <> {reason}</> : null}
        </p>

        <ul className="mt-4 space-y-2 font-mono text-[11px] leading-[1.6] text-ink-2">
          <li>· Valoració · mediana ciutat amb interval P25–P75</li>
          <li>· Tesi cashflow · long-let amb sostre SERPAVI</li>
          <li>· Tesi appreciation · projecció CAGR a 25 anys</li>
          <li>· Tesi renovate+flip · cost €/m² per condició</li>
          <li>· Comparables propers · ciutat + comarca</li>
          <li>· Anàlisi de risc · okupa, sostre legal, HUT</li>
        </ul>

        <div className="mt-6 flex flex-col gap-2">
          <Link
            href={`/login?next=${encodeURIComponent(returnTo)}` as Route}
            className="block rounded-sm border border-cyan bg-cyan/15 px-4 py-2.5 text-center font-mono text-[12px] uppercase tracking-[0.16em] text-cyan hover:border-cyan-hot hover:bg-cyan/25"
          >
            Inicia sessió
          </Link>
          <Link
            href={'/login?signup=1' as Route}
            className="block rounded-sm border border-line-2 px-4 py-2.5 text-center font-mono text-[11px] uppercase tracking-[0.16em] text-ink-2 hover:border-cyan-dim hover:text-ink-1"
          >
            Crea compte · gratis 7 dies
          </Link>
        </div>

        <p className="mt-4 text-center font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">
          Multi-tenant · dades reals · zero placeholders
        </p>
      </div>
    </div>
  );
}
