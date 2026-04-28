'use client';

import type { Listing } from '@/lib/supabase/types';
import { Badge } from '@/components/primitives/badge';
import { formatEur } from '@/lib/format';

type Props = {
  listing: Listing | null;
  xy: { x: number; y: number } | null;
};

// Callout — floating annotation card that hangs off the selected map marker.
// Positioned in screen-pixel space by the parent <MapView/>. The CSS triangle
// stem points back to the pin on the left edge.
export function Callout({ listing, xy }: Props) {
  if (!listing || !xy) return null;

  const isInZona = listing.in_zona_tensionada === true;
  const p25 = listing.gross_yield_pct_p25;
  const p75 = listing.gross_yield_pct_p75;
  const yieldRange =
    p25 != null && p75 != null
      ? `${p25.toFixed(1)}–${p75.toFixed(1)}%`
      : '—';

  const m2 = listing.m2 != null ? `${Math.round(listing.m2)}m²` : '—';
  const beds = listing.beds != null ? `${listing.beds} hab` : '—';
  const baths = listing.baths != null ? `${listing.baths} bany` : '—';

  const yearBuilt = listing.year_built ? `Construït ${listing.year_built}` : '';
  const yearReno = listing.year_renovated
    ? ` · Reformat ${listing.year_renovated}`
    : '';
  const ete = listing.energy_cert ? ` · ETE ${listing.energy_cert}` : '';

  // Position the callout 24px to the right of the marker, vertically centered.
  const left = xy.x + 24;
  const top = xy.y - 60;

  return (
    <div
      className="pointer-events-auto absolute z-20 w-[300px] border border-line-2 bg-bg-2 px-4 py-3 shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
      style={{
        left: `${left}px`,
        top: `${top}px`,
      }}
    >
      {/* Stem pointing left toward the pin. */}
      <span
        aria-hidden
        className="absolute"
        style={{
          left: '-8px',
          top: '52px',
          width: 0,
          height: 0,
          borderTop: '8px solid transparent',
          borderBottom: '8px solid transparent',
          borderRight: '8px solid var(--color-line-2)',
        }}
      />
      <span
        aria-hidden
        className="absolute"
        style={{
          left: '-7px',
          top: '52px',
          width: 0,
          height: 0,
          borderTop: '8px solid transparent',
          borderBottom: '8px solid transparent',
          borderRight: '8px solid var(--color-bg-2)',
        }}
      />

      <div className="flex items-center justify-between">
        <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3">
          PIS SELECCIONAT · {listing.id}
        </div>
        {isInZona ? (
          <Badge variant="ghost-amber">ZONA TENSIONADA</Badge>
        ) : (
          <Badge variant="ghost-green">SENSE SOSTRE LEGAL</Badge>
        )}
      </div>

      <div className="mt-2 text-[13px] font-medium leading-tight text-ink-0">
        {listing.address ?? listing.title ?? 'Adreça no disponible'}
      </div>
      <div className="text-[11px] text-ink-2">{listing.city_slug}</div>

      <div className="mt-2 font-mono text-[11px] text-ink-1">
        {m2} · {beds} · {baths}
      </div>
      {(yearBuilt || yearReno || ete) && (
        <div className="font-mono text-[10px] text-ink-3">
          {yearBuilt}
          {yearReno}
          {ete}
        </div>
      )}

      <div className="mt-3 flex items-end justify-between border-t border-line-1 pt-2">
        <div className="font-display text-[20px] font-medium leading-none text-amber">
          {formatEur(listing.price_eur)}
        </div>
        <div className="text-right">
          <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-ink-3">
            Yield P25–P75
          </div>
          <div className="font-mono text-[12px] text-cyan">{yieldRange}</div>
        </div>
      </div>
    </div>
  );
}
