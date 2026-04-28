import Link from 'next/link';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/server';
import type { Listing, ConditionLabel } from '@/lib/supabase/types';
import { TopBar } from '@/components/chrome/top-bar';
import { Badge } from '@/components/primitives/badge';
import { formatEur, formatNumber, formatPct } from '@/lib/format';
import { t } from '@/lib/i18n';
import { getActiveListingsCount, getActivityCount24h } from '@/lib/activity';

/**
 * `/pipeline` — Kanban view of every live listing, bucketed into 5 stages.
 *
 * v1 is read-only: no drag/drop, no persistence. Bucketing is purely derived
 * from yield + condition heuristics so the page is debuggable. Real pipeline
 * persistence (drag-to-stage, comments, owners) lands in a later wave.
 *
 * Each card links to /listing/[id] so the user can drill in.
 */

const COLUMNS = [
  { key: 'descobert', title: 'Descobert' },
  { key: 'revisio', title: 'En revisió' },
  { key: 'visitat', title: 'Visitat' },
  { key: 'oferta', title: 'Oferta' },
  { key: 'tancat', title: 'Tancat' },
] as const;

type ColumnKey = (typeof COLUMNS)[number]['key'];

function bucketize(l: Listing): ColumnKey {
  const y50 = l.gross_yield_pct_p50 ?? 0;
  const cond: ConditionLabel = l.condition_label;
  if (y50 >= 7) return 'oferta';
  if (cond === 'reform_needed' && y50 >= 5.5) return 'visitat';
  if (cond === 'reform_needed' || cond === 'wreck') return 'revisio';
  return 'descobert';
}

const CONDITION_VARIANT: Record<
  ConditionLabel,
  'good' | 'warning' | 'critical' | 'info' | 'ghost-amber'
> = {
  reformado: 'good',
  good: 'info',
  reform_needed: 'warning',
  wreck: 'critical',
  unknown: 'ghost-amber',
};

export default async function PipelinePage() {
  const supabase = await createClient();
  const [{ data }, activityCount, activeListingsCount] = await Promise.all([
    supabase
      .from('listings')
      .select('*')
      .is('removed_at', null)
      .order('first_seen_at', { ascending: false })
      .limit(200),
    getActivityCount24h(),
    getActiveListingsCount(),
  ]);
  const listings = (data ?? []) as Listing[];

  const buckets: Record<ColumnKey, Listing[]> = {
    descobert: [],
    revisio: [],
    visitat: [],
    oferta: [],
    tancat: [],
  };
  for (const l of listings) buckets[bucketize(l)].push(l);

  return (
    <div className="flex h-screen min-h-0 flex-col bg-bg-0 text-ink-1">
      <TopBar activityCount={activityCount} />

      <main className="flex flex-1 min-h-0 flex-col px-6 pt-5">
        <header className="mb-4 flex items-end justify-between gap-4 border-b border-line-1 pb-4">
          <div>
            <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-3">
              Brúixola · Pipeline
            </div>
            <h1 className="mt-1 font-display text-[28px] font-medium tracking-tight text-ink-0">
              Pipeline
            </h1>
            <p className="mt-1 max-w-2xl text-[13px] text-ink-2">
              Bucketing automàtic per yield i condició. La persistència
              (arrossega-i-deixa, propietaris, comentaris) arriba a la propera
              versió.
            </p>
          </div>
          <div className="font-mono text-[11px] tabular-nums text-ink-3">
            {formatNumber(listings.length)} pisos vius
          </div>
        </header>

        <div className="grid flex-1 min-h-0 grid-cols-1 gap-3 pb-6 md:grid-cols-2 xl:grid-cols-5">
          {COLUMNS.map((col) => {
            const items = buckets[col.key];
            return (
              <section
                key={col.key}
                className="flex min-h-0 flex-col rounded-sm border border-line-1 bg-bg-1"
              >
                <header className="flex items-center justify-between border-b border-line-1 px-3 py-2">
                  <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-2">
                    {col.title}
                  </h2>
                  <span className="rounded-sm border border-line-2 bg-bg-2 px-1.5 py-[1px] font-mono text-[9px] tabular-nums text-ink-2">
                    {items.length}
                  </span>
                </header>

                <div className="scrollbar-thin flex-1 overflow-y-auto p-2">
                  {items.length === 0 ? (
                    <div className="rounded-sm border border-dashed border-line-2 bg-bg-1 px-3 py-6 text-center font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3">
                      + buit
                    </div>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {items.map((l) => (
                        <li key={l.id}>
                          <Link
                            href={`/listing/${l.id}`}
                            className="group block rounded-sm border border-line-2 bg-bg-2 transition-colors hover:border-cyan-dim"
                          >
                            <div className="relative aspect-[16/9] w-full overflow-hidden border-b border-line-1 bg-bg-3">
                              {l.photos[0] ? (
                                <Image
                                  src={l.photos[0]}
                                  alt={l.address ?? l.id}
                                  fill
                                  sizes="240px"
                                  className="object-cover"
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3">
                                  sense foto
                                </div>
                              )}
                            </div>
                            <div className="p-2.5">
                              <div className="line-clamp-1 text-[12px] text-ink-0 group-hover:text-cyan">
                                {l.address ?? l.title ?? l.id}
                              </div>
                              <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">
                                {l.city_slug}
                              </div>
                              <div className="mt-2 flex items-center justify-between">
                                <span className="font-mono text-[12px] tabular-nums text-amber">
                                  {formatEur(l.price_eur)}
                                </span>
                                <span className="font-mono text-[11px] tabular-nums text-cyan">
                                  {formatPct(l.gross_yield_pct_p50)}
                                </span>
                              </div>
                              <div className="mt-2">
                                <Badge
                                  variant={
                                    CONDITION_VARIANT[l.condition_label] ?? 'info'
                                  }
                                >
                                  {t(l.condition_label, 'condition_label')}
                                </Badge>
                              </div>
                            </div>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </main>
    </div>
  );
}
