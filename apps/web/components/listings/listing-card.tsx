import Image from 'next/image';
import Link from 'next/link';
import type { Route } from 'next';
import type { Listing } from '@/lib/supabase/types';
import { trackListing, untrackListing } from '@/app/listings/actions';
import { formatEur, formatNumber, formatPct } from '@/lib/format';

type Props = {
  listing: Listing;
  tracked: boolean;
  loggedIn: boolean;
  /** When provided, restored after track/untrack so the user lands back on the same query state. */
  returnTo: string;
};

/**
 * Card for /listings grid view. Photo-first, dense but breathable. Single
 * line of metadata under the price; chips bottom-right; ★ button overlay
 * top-right. Click anywhere on the card surface (except the ★) navigates
 * to /listing/[id].
 */
export function ListingCard({ listing, tracked, loggedIn, returnTo }: Props) {
  const perM2 =
    listing.m2 && listing.m2 > 0
      ? Math.round(listing.price_eur / listing.m2)
      : null;
  const photo = listing.photos?.[0] ?? null;

  return (
    <article
      className="group relative flex flex-col overflow-hidden border border-line-1 bg-bg-1 transition-colors hover:border-cyan-dim"
    >
      {/* Photo */}
      <Link
        href={`/listing/${listing.id}` as Route}
        className="relative block aspect-[4/3] overflow-hidden bg-bg-2"
        aria-label={`Veure ${listing.address ?? listing.title ?? listing.id}`}
      >
        {photo ? (
          <Image
            src={photo}
            alt={listing.address ?? listing.title ?? 'Anunci'}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1280px) 33vw, 280px"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
            unoptimized
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">
            sense foto
          </div>
        )}

        {/* gradient for badge legibility */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-bg-0/80 to-transparent"
          aria-hidden
        />

        {/* APN stamp top-left */}
        <div className="pointer-events-none absolute left-2 top-2 font-mono text-[9px] uppercase tracking-[0.16em] text-ink-2">
          APN · {listing.id.slice(0, 6).toUpperCase()}
        </div>

        {/* tensionada flag bottom-left over photo */}
        {listing.in_zona_tensionada && (
          <div className="absolute bottom-2 left-2 inline-flex border border-amber bg-amber/20 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-amber backdrop-blur-sm">
            tensionada
          </div>
        )}
      </Link>

      {/* ★ button overlay top-right */}
      <div className="absolute right-2 top-2 z-10">
        <TrackOverlay
          listingId={listing.id}
          tracked={tracked}
          loggedIn={loggedIn}
          returnTo={returnTo}
        />
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-2 px-3 py-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-display text-[18px] font-medium leading-none tracking-tight text-ink-0">
            {formatEur(listing.price_eur)}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3 tabular-nums">
            {perM2 != null ? `${formatNumber(perM2)} €/m²` : '—'}
          </span>
        </div>

        <Link
          href={`/listing/${listing.id}` as Route}
          className="line-clamp-1 text-[12px] text-ink-1 hover:text-cyan"
          title={listing.address ?? listing.title ?? listing.id}
        >
          {listing.address ?? listing.title ?? listing.id}
        </Link>

        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">
          <span className="truncate">{listing.city_slug}</span>
          {listing.m2 != null && (
            <>
              <span aria-hidden>·</span>
              <span>{formatNumber(Math.round(listing.m2))} m²</span>
            </>
          )}
          {listing.beds != null && (
            <>
              <span aria-hidden>·</span>
              <span>{listing.beds}h</span>
            </>
          )}
        </div>

        <div className="mt-auto flex items-center justify-between border-t border-line-1 pt-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">
            yield p50
          </span>
          <span className="font-mono text-[12px] tabular-nums text-cyan">
            {formatPct(listing.gross_yield_pct_p50)}
          </span>
        </div>
      </div>
    </article>
  );
}

function TrackOverlay({
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
        href={
          (`/login?next=${encodeURIComponent(returnTo)}`) as Route
        }
        className="flex h-8 w-8 items-center justify-center border border-line-2 bg-bg-1/85 font-mono text-[14px] text-ink-2 backdrop-blur-sm hover:border-cyan-dim hover:text-cyan"
        title="Entra per seguir aquest anunci"
        aria-label="Entra per seguir"
      >
        ☆
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
          title="Deixar de seguir"
          aria-label="Deixar de seguir"
          className="flex h-8 w-8 items-center justify-center border border-green bg-green/20 font-mono text-[14px] text-green backdrop-blur-sm hover:border-green-hot hover:bg-green/30"
        >
          ✓
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
        title="Seguir aquest anunci"
        aria-label="Seguir"
        className="flex h-8 w-8 items-center justify-center border border-cyan bg-cyan/20 font-mono text-[14px] text-cyan backdrop-blur-sm hover:bg-cyan/30"
      >
        ★
      </button>
    </form>
  );
}
