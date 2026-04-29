'use client';

import Image from 'next/image';
import Link from 'next/link';
import type { Route } from 'next';
import { trackListing, untrackListing } from '@/app/listings/actions';
import { formatEur, formatM2, formatNumber, formatPct } from '@/lib/format';
import type { ListingMarker } from '@/lib/market';

type Props = {
  listing: ListingMarker;
  loggedIn: boolean;
  /** URL to land on after track/untrack. */
  returnTo: string;
  onClose: () => void;
};

/**
 * Right-panel listing miniature for the COP map (`?map=anuncis`).
 *
 * Mirrors the Dossier/MarketPanel register: cool-dark, cyan accent,
 * mono labels. Drives 3 actions: ★ Seguir / ✓ Seguint, "Obrir fitxa →",
 * and "✕ Tanca" (deselect).
 */
export function ListingMiniature({
  listing,
  loggedIn,
  returnTo,
  onClose,
}: Props) {
  const perM2 =
    listing.price_eur && listing.m2 && listing.m2 > 0
      ? Math.round(listing.price_eur / listing.m2)
      : null;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex items-start justify-between gap-2 border-b border-line-1 px-4 py-3">
        <div className="min-w-0">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-cyan">
            APN · {listing.id.slice(0, 8).toUpperCase()}
          </div>
          <div className="mt-1 truncate text-[12px] text-ink-2">
            {listing.city_name}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Tanca"
          className="font-mono text-[14px] text-ink-3 hover:text-ink-0"
        >
          ✕
        </button>
      </header>

      <div className="relative aspect-[4/3] w-full overflow-hidden bg-bg-2">
        {listing.photo ? (
          <Image
            src={listing.photo}
            alt={listing.title}
            fill
            sizes="380px"
            className="object-cover"
            unoptimized
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">
            sense foto
          </div>
        )}
        {listing.in_zona_tensionada && (
          <div className="absolute bottom-2 left-2 inline-flex border border-amber bg-amber/20 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-amber backdrop-blur-sm">
            tensionada
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col overflow-y-auto px-4 py-4">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-display text-[24px] font-medium leading-none tracking-tight text-ink-0">
            {listing.price_eur != null ? formatEur(listing.price_eur) : '—'}
          </span>
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3 tabular-nums">
            {perM2 != null ? `${formatNumber(perM2)} €/m²` : '—'}
          </span>
        </div>

        <p
          className="mt-2 line-clamp-2 text-[13px] leading-[1.4] text-ink-1"
          title={listing.address ?? listing.title}
        >
          {listing.address ?? listing.title}
        </p>

        <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-line-1 pt-4 text-[11px]">
          <Stat label="m²" value={formatM2(listing.m2)} />
          <Stat
            label="Hab"
            value={listing.beds != null ? String(listing.beds) : '—'}
          />
          <Stat
            label="Yield P50"
            value={formatPct(listing.yield_p50)}
            tone={listing.in_zona_tensionada === true ? 'amber' : undefined}
          />
        </dl>

        <div className="mt-auto flex flex-col gap-2 border-t border-line-1 pt-4">
          <TrackAction
            listingId={listing.id}
            tracked={listing.tracked}
            loggedIn={loggedIn}
            returnTo={returnTo}
          />
          <Link
            href={`/listing/${listing.id}` as Route}
            className="inline-flex items-center justify-center border border-line-2 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.16em] text-ink-2 hover:border-cyan-dim hover:text-cyan"
          >
            Obrir fitxa →
          </Link>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'amber';
}) {
  return (
    <div>
      <dt className="font-mono text-[9px] uppercase tracking-[0.16em] text-ink-3">
        {label}
      </dt>
      <dd
        className={`mt-0.5 font-mono tabular-nums ${
          tone === 'amber' ? 'text-amber' : 'text-ink-0'
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function TrackAction({
  listingId,
  tracked,
  loggedIn,
  returnTo,
}: {
  listingId: string;
  tracked: boolean;
  loggedIn: boolean;
  returnTo: string;
}) {
  if (!loggedIn) {
    return (
      <Link
        href={`/login?next=${encodeURIComponent(returnTo)}` as Route}
        className="inline-flex items-center justify-center border border-cyan bg-cyan/15 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.16em] text-cyan hover:bg-cyan/25"
      >
        ★ Entra per seguir
      </Link>
    );
  }
  if (tracked) {
    return (
      <form action={untrackListing}>
        <input type="hidden" name="listing_id" value={listingId} />
        <input type="hidden" name="return_to" value={returnTo} />
        <button
          type="submit"
          className="inline-flex w-full items-center justify-center border border-green-dim bg-green-dim/15 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.16em] text-green hover:border-green hover:text-green-hot"
        >
          ✓ Seguint · click per deixar
        </button>
      </form>
    );
  }
  return (
    <form action={trackListing}>
      <input type="hidden" name="listing_id" value={listingId} />
      <input type="hidden" name="return_to" value={returnTo} />
      <button
        type="submit"
        className="inline-flex w-full items-center justify-center border border-cyan bg-cyan/15 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.16em] text-cyan hover:bg-cyan/25"
      >
        ★ Seguir
      </button>
    </form>
  );
}
