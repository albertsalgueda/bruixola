/**
 * MarketReality — fuses the 3 redundant comparison surfaces in v2 into one.
 *
 * Replaces:
 *   - the "Comparació de mercat" sub-block inside the valuation card
 *   - the placeholder 14-bar histogram with literal JSX values
 *   - the standalone "Comparables propers" right-column section
 *
 * v3 design: ONE histogram of the comp set €/m² distribution + subject
 * marker line + comp list below. Provenance footer surfaces "n=8 comps a
 * Ripollès · derivat de listings.price_eur ÷ m²" so investors see what's
 * observed vs inferred.
 *
 * No histogram is rendered when n < 5 — honest "sample too small" copy
 * instead. Keeps us out of the v2 trap of fake density.
 */

import Link from 'next/link';
import type { Route } from 'next';
import type { Listing } from '@/lib/supabase/types';
import { formatEur, formatNumber } from '@/lib/format';

const DASH = '–';

type Props = {
  /** Subject's €/m² (rounded). */
  subjectEurM2: number | null;
  /** Comparables (already filtered + sorted by closeness in the page). */
  comps: Listing[];
  /** 'city' or 'comarca' — drives the scope label in the header. */
  compsScope: 'city' | 'comarca';
  /** Comarca slug for the comarca-fallback label. */
  comarcaLabel?: string | null;
  /** City median €/m² for the comparison line. */
  cityMedianEurM2: number | null;
};

const HISTOGRAM_BUCKETS = 10;
const MIN_COMPS_FOR_DISTRIBUTION = 5;

export function MarketReality({
  subjectEurM2,
  comps,
  compsScope,
  comarcaLabel,
  cityMedianEurM2,
}: Props) {
  // Compute the distribution from real comp €/m² values.
  const compsWithEurM2: number[] = comps
    .map((c) => (c.m2 && c.m2 > 0 ? c.price_eur / c.m2 : null))
    .filter((v): v is number => v != null && v > 0);

  const enoughForDistribution =
    compsWithEurM2.length >= MIN_COMPS_FOR_DISTRIBUTION;

  let buckets: number[] = [];
  let bucketBounds: { min: number; max: number } | null = null;
  let subjectBucketIdx: number | null = null;

  if (enoughForDistribution) {
    const all = [...compsWithEurM2];
    if (subjectEurM2 != null) all.push(subjectEurM2);
    const min = Math.min(...all);
    const max = Math.max(...all);
    const span = max - min || 1;
    const bw = span / HISTOGRAM_BUCKETS;
    buckets = new Array(HISTOGRAM_BUCKETS).fill(0);
    for (const v of compsWithEurM2) {
      const idx = Math.min(
        HISTOGRAM_BUCKETS - 1,
        Math.floor((v - min) / bw),
      );
      buckets[idx] += 1;
    }
    bucketBounds = { min, max };
    if (subjectEurM2 != null) {
      subjectBucketIdx = Math.min(
        HISTOGRAM_BUCKETS - 1,
        Math.max(0, Math.floor((subjectEurM2 - min) / bw)),
      );
    }
  }

  const maxBucket = buckets.length > 0 ? Math.max(...buckets) || 1 : 1;

  return (
    <section
      aria-label="Realitat de mercat"
      className="rounded-sm border border-line-1 bg-bg-1"
    >
      <header className="flex items-center justify-between border-b border-line-1 px-5 py-3">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">
          Realitat de mercat
          {compsScope === 'comarca' && comarcaLabel ? (
            <span className="ml-2 text-cyan">· comarca {comarcaLabel}</span>
          ) : null}
        </h2>
        <span className="font-mono text-[10px] tabular-nums text-ink-3">
          n={compsWithEurM2.length} {compsWithEurM2.length === 1 ? 'comp' : 'comps'}
        </span>
      </header>

      <div className="px-5 py-4">
        {/* Top numeric line — subject vs city median */}
        {subjectEurM2 != null && (
          <div className="flex items-baseline gap-3 font-mono">
            <span className="font-display text-[20px] font-medium tracking-tight text-ink-0">
              {formatNumber(subjectEurM2)} €/m²
            </span>
            <span className="text-[11px] text-ink-3">aquest anunci</span>
            {cityMedianEurM2 != null && (
              <span className="ml-auto text-[11px] text-ink-3">
                mediana ciutat {formatNumber(Math.round(cityMedianEurM2))} €/m²
              </span>
            )}
          </div>
        )}

        {/* Distribution */}
        {enoughForDistribution && bucketBounds ? (
          <div className="mt-4">
            <svg
              viewBox="0 0 220 60"
              className="w-full"
              role="img"
              aria-label="Distribució €/m² del comp set"
            >
              {buckets.map((h, i) => (
                <rect
                  key={i}
                  x={i * 22 + 2}
                  y={60 - (h / maxBucket) * 50 - 2}
                  width={18}
                  height={(h / maxBucket) * 50}
                  className={
                    i === subjectBucketIdx
                      ? 'fill-cyan'
                      : 'fill-cyan-dim opacity-60'
                  }
                />
              ))}
              {subjectBucketIdx != null && (
                <line
                  x1={subjectBucketIdx * 22 + 11}
                  x2={subjectBucketIdx * 22 + 11}
                  y1={2}
                  y2={60}
                  className="stroke-amber"
                  strokeDasharray="2 2"
                  strokeWidth={1}
                />
              )}
            </svg>
            <div className="mt-1 flex justify-between font-mono text-[10px] text-ink-3">
              <span>{formatNumber(Math.round(bucketBounds.min))} €/m²</span>
              <span>{formatNumber(Math.round(bucketBounds.max))} €/m²</span>
            </div>
          </div>
        ) : (
          <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.14em] text-amber">
            Sample massa petit per dibuixar distribució (n &lt; {MIN_COMPS_FOR_DISTRIBUTION})
          </p>
        )}

        {/* Comp list */}
        {comps.length > 0 ? (
          <ul className="mt-4 flex flex-col divide-y divide-line-1">
            {comps.slice(0, 5).map((c) => {
              const cM2 = c.m2 ?? null;
              const perM2 = cM2 && cM2 > 0 ? Math.round(c.price_eur / cM2) : null;
              const subjectLabel = c.address ?? c.title ?? c.id;
              return (
                <li key={c.id} className="py-2">
                  <Link
                    href={`/listing/${c.id}` as Route}
                    className="flex items-baseline justify-between gap-3 hover:bg-bg-2/50"
                  >
                    <span className="truncate text-[12px] text-ink-1">
                      {subjectLabel}
                    </span>
                    <span className="shrink-0 font-mono text-[11px] tabular-nums text-ink-3">
                      {formatEur(c.price_eur)}
                      {cM2 != null && (
                        <>
                          <span className="mx-1 text-ink-3">·</span>
                          {formatNumber(Math.round(cM2))} m²
                        </>
                      )}
                      {perM2 != null && (
                        <>
                          <span className="mx-1 text-ink-3">·</span>
                          <span className="text-cyan">
                            {formatNumber(perM2)} €/m²
                          </span>
                        </>
                      )}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.14em] text-amber">
            Sense comparables a l'abast · banda massa estreta
          </p>
        )}
      </div>

      <footer className="border-t border-line-1 px-5 py-2 font-mono text-[10px] text-ink-3">
        Provenance: comp €/m² derivat de listings.price_eur ÷ listings.m². No
        es ponderen per any de venda · v1 lineal.
      </footer>
    </section>
  );
}
