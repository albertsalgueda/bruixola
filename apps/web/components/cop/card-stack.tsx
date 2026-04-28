'use client';

import type { Listing } from '@/lib/supabase/types';
import { Badge } from '@/components/primitives/badge';
import { YieldBar } from '@/components/cop/yield-bar';
import {
  formatEur,
  formatM2,
  formatPct,
  formatPriceM2,
} from '@/lib/format';

type Props = {
  listing: Listing | null;
};

// CardStack — right 380px panel.
// Three vertical cards: yield detection (with the YieldBar + AI-detection
// tiles), a mini-map preview, and a property-details grid. When no listing is
// selected we render an empty-state card prompting the user to pick a pin.
export function CardStack({ listing }: Props) {
  return (
    <div className="scrollbar-thin flex h-full flex-col gap-2 overflow-y-auto p-3">
      {!listing ? (
        <EmptyState />
      ) : (
        <>
          <YieldDetectionCard listing={listing} />
          <MapMiniCard listing={listing} />
          <PropertyDetailsCard listing={listing} />
          <ActionsRow listingId={listing.id} />
        </>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="border border-line-1 bg-bg-2 px-4 py-8 text-center">
      <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">
        Pis seleccionat
      </h2>
      <div className="mt-3 font-display text-[15px] text-ink-1">
        Selecciona un pis al mapa
      </div>
      <div className="mt-2 text-[11px] leading-[1.5] text-ink-3">
        Clica un dels pins cyan per obrir la fitxa, calcular el yield contra el
        sostre legal SERPAVI i veure les comparacions. Si no veus pisos, comprova
        la connexió a Supabase a apps/web/.env.local.
      </div>
    </div>
  );
}

function YieldDetectionCard({ listing }: { listing: Listing }) {
  const inZona = listing.in_zona_tensionada === true;
  const p75 = listing.gross_yield_pct_p75;
  const legalMax = listing.gross_yield_pct_legal_max;
  const overCeiling =
    inZona &&
    p75 != null &&
    legalMax != null &&
    p75 > legalMax;

  const headline = overCeiling
    ? 'Yield per sobre del sostre legal'
    : 'Yield dins del sostre legal';
  const headlineTone = overCeiling ? 'text-amber' : 'text-green';

  return (
    <div className="border border-line-1 bg-bg-2">
      {/* Header */}
      <div className="flex items-start gap-3 border-b border-line-1 px-4 py-3">
        <WarningGlyph tone={overCeiling ? 'amber' : 'green'} />
        <div className="flex-1">
          <h2 className={`text-[13px] font-medium leading-tight ${headlineTone}`}>
            {headline}
          </h2>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3">
            Càlcul automàtic · zona tensionada · SERPAVI
          </p>
        </div>
      </div>

      {/* Yield range */}
      <div className="border-b border-line-1 px-4 py-3">
        <YieldBar
          p25={listing.gross_yield_pct_p25}
          p50={listing.gross_yield_pct_p50}
          p75={listing.gross_yield_pct_p75}
          legalMax={listing.gross_yield_pct_legal_max}
          inZonaTensionada={listing.in_zona_tensionada}
        />
      </div>

      {/* Detection tiles */}
      <div className="grid grid-cols-2 gap-2 p-3">
        <DetectionTile
          label={`Pis ${(listing.address ?? listing.city_slug).slice(0, 14)}`}
          confidence="89%"
        />
        <DetectionTile
          label={`Pis ${listing.m2 != null ? `${Math.round(listing.m2)}m²` : '—'}`}
          confidence="87%"
        />
      </div>
    </div>
  );
}

function DetectionTile({
  label,
  confidence,
}: {
  label: string;
  confidence: string;
}) {
  return (
    <div
      className="relative h-[96px] overflow-hidden border border-dashed border-amber/60"
      style={{
        background:
          'linear-gradient(135deg, var(--color-bg-3) 0%, var(--color-bg-1) 100%)',
      }}
    >
      {/* Grid overlay */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(232,178,92,0.18) 1px, transparent 1px), linear-gradient(to bottom, rgba(232,178,92,0.18) 1px, transparent 1px)',
          backgroundSize: '12px 12px',
        }}
      />
      {/* Corner brackets */}
      <span
        aria-hidden
        className="absolute left-1 top-1 h-2 w-2 border-t border-l border-amber"
      />
      <span
        aria-hidden
        className="absolute right-1 top-1 h-2 w-2 border-t border-r border-amber"
      />
      <span
        aria-hidden
        className="absolute left-1 bottom-1 h-2 w-2 border-b border-l border-amber"
      />
      <span
        aria-hidden
        className="absolute right-1 bottom-1 h-2 w-2 border-b border-r border-amber"
      />

      <div className="absolute bottom-1 left-2 right-2 font-mono text-[9px] uppercase tracking-[0.14em] text-ink-1">
        {label}
      </div>
      <div className="absolute right-2 top-1 font-mono text-[9px] uppercase tracking-[0.14em] text-amber">
        {confidence} certesa
      </div>
    </div>
  );
}

function MapMiniCard({ listing }: { listing: Listing }) {
  return (
    <div className="border border-line-1 bg-bg-2">
      <div className="flex items-center justify-between border-b border-line-1 px-4 py-2">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">
          Localització
        </div>
        <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-ink-3">
          {listing.platform}
        </div>
      </div>
      <div
        className="relative h-[130px] overflow-hidden"
        style={{
          background:
            'radial-gradient(circle at 50% 50%, var(--color-bg-3) 0%, var(--color-bg-0) 80%)',
        }}
      >
        {/* Faux contour grid */}
        <div
          aria-hidden
          className="absolute inset-0 opacity-25"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgba(95,180,212,0.18) 1px, transparent 1px), linear-gradient(to bottom, rgba(95,180,212,0.18) 1px, transparent 1px)',
            backgroundSize: '20px 20px',
          }}
        />
        {/* Star marker */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className="text-[18px] leading-none text-amber drop-shadow-[0_0_8px_rgba(232,178,92,0.6)]">
            ★
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between px-4 py-2 text-[11px]">
        <span className="text-ink-1">{listing.address ?? listing.city_slug}</span>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">
          {listing.city_slug.toLowerCase().replace(/\s+/g, '-')} · {listing.platform}
        </span>
      </div>
    </div>
  );
}

function PropertyDetailsCard({ listing }: { listing: Listing }) {
  const priceM2 =
    listing.m2 && listing.m2 > 0
      ? (formatPriceM2(listing.price_eur, listing.m2) ?? '—')
      : '—';

  return (
    <div className="border border-line-1 bg-bg-2">
      <div className="border-b border-line-1 px-4 py-2">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">
          Fitxa de la propietat
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-2 px-4 py-3">
        {/* PREU — full width */}
        <div className="col-span-2 border-b border-line-1 pb-2">
          <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-3">
            Preu
          </div>
          <div className="font-display text-[22px] font-medium leading-none text-amber">
            {formatEur(listing.price_eur)}
          </div>
          <div className="mt-1 font-mono text-[10px] text-ink-2">
            {priceM2} €/m²
          </div>
        </div>

        <DetailCell label="Superfície" value={formatM2(listing.m2)} />
        <DetailCell label="€/m²" value={priceM2} tone="cyan" />
        <DetailCell
          label="Habitacions"
          value={listing.beds != null ? String(listing.beds) : '—'}
        />
        <DetailCell
          label="Ascensor"
          value={
            listing.lift === true ? 'Sí' : listing.lift === false ? 'No' : '—'
          }
        />
        <DetailCell
          label="Construcció"
          value={listing.year_built ? String(listing.year_built) : '—'}
        />
        <DetailCell
          label="Reformat"
          value={
            listing.year_renovated ? String(listing.year_renovated) : '—'
          }
        />
        <DetailCell
          label="ETE"
          value={listing.energy_cert ?? '—'}
          tone={listing.energy_cert ? 'cyan' : 'dim'}
        />
        <DetailCell
          label="HUT"
          value={listing.hut_license_id ?? 'Sense'}
          tone={listing.hut_license_id ? 'green' : 'dim'}
        />
        <DetailCell
          label="Okupació"
          value={
            listing.okupa_risk === 'high'
              ? 'Alt'
              : listing.okupa_risk === 'medium'
                ? 'Mitjà'
                : listing.okupa_risk === 'low'
                  ? 'Baix'
                  : '—'
          }
          tone={listing.okupa_risk === 'high' ? 'amber' : 'dim'}
        />
        <DetailCell
          label="Yield P50"
          value={
            listing.gross_yield_pct_p50 != null
              ? formatPct(listing.gross_yield_pct_p50)
              : '—'
          }
          tone="cyan"
        />
      </div>
    </div>
  );
}

function DetailCell({
  label,
  value,
  tone = 'ink',
}: {
  label: string;
  value: string;
  tone?: 'ink' | 'cyan' | 'amber' | 'green' | 'dim';
}) {
  const valueClass =
    tone === 'cyan'
      ? 'text-cyan'
      : tone === 'amber'
        ? 'text-amber'
        : tone === 'green'
          ? 'text-green'
          : tone === 'dim'
            ? 'text-ink-3'
            : 'text-ink-0';
  return (
    <div>
      <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-3">
        {label}
      </div>
      <div className={`font-mono text-[12px] ${valueClass}`}>{value}</div>
    </div>
  );
}

function ActionsRow({ listingId }: { listingId: string }) {
  return (
    <div className="flex items-center gap-2 pt-1">
      <a
        href={`/listing/${listingId}`}
        className="flex-1 cursor-pointer border border-cyan bg-cyan/15 px-3 py-2 text-center text-[12px] font-medium text-cyan hover:bg-cyan/25"
      >
        Obrir dossier complet →
      </a>
    </div>
  );
}

function WarningGlyph({ tone }: { tone: 'amber' | 'green' }) {
  const color = tone === 'amber' ? 'text-amber' : 'text-green';
  // Simple triangle / check glyph — pure SVG, scales with the text.
  if (tone === 'green') {
    return (
      <svg
        className={`mt-0.5 h-4 w-4 shrink-0 ${color}`}
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden
      >
        <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.2" />
        <path
          d="M4.5 8.4L7 10.8L11.5 5.6"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg
      className={`mt-0.5 h-4 w-4 shrink-0 ${color}`}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
    >
      <path
        d="M8 1.5L15 14H1L8 1.5Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path
        d="M8 6V9.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <circle cx="8" cy="11.6" r="0.8" fill="currentColor" />
    </svg>
  );
}
