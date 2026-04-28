import Link from 'next/link';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/server';
import type { Listing } from '@/lib/supabase/types';
import { TopBar } from '@/components/chrome/top-bar';
import { StatusStrip } from '@/components/chrome/status-strip';
import { Badge } from '@/components/primitives/badge';
import { formatEur, formatPct } from '@/lib/format';
import { getActiveListingsCount, getActivityCount24h } from '@/lib/activity';

// Always render fresh: timestamps in this stream are relative ("fa 4 hores")
// and would otherwise be served stale from the route cache while the
// underlying listing rows update.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * `/activity` — reverse-chronological event stream.
 *
 * For v1 the only "events" we have are listings ordered by first_seen_at DESC.
 * Future filter chips (BAIXADA PREU / VENUT / HUT / RENT-CAP) are visible but
 * disabled — labelled "(properament)" with cursor-not-allowed so the user
 * can see the surface area without being misled.
 */

function relativeCa(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const now = Date.now();
  const diff = Math.round((now - then) / 1000);
  if (diff < 60) return 'fa instants';
  if (diff < 3600) return `fa ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `fa ${Math.floor(diff / 3600)} h`;
  if (diff < 86400 * 7) return `fa ${Math.floor(diff / 86400)} d`;
  return new Date(iso).toLocaleDateString('ca-ES', {
    day: '2-digit',
    month: 'short',
  });
}

const CHIPS: Array<{ key: string; label: string; active: boolean }> = [
  { key: 'new', label: 'Nova llista', active: true },
  { key: 'price_drop', label: 'Baixada preu', active: false },
  { key: 'sold', label: 'Venut', active: false },
  { key: 'hut', label: 'HUT', active: false },
  { key: 'rent_cap', label: 'Rent-cap', active: false },
];

export default async function ActivityPage() {
  const supabase = await createClient();

  const [listingsRes, activityCount, activeListingsCount] = await Promise.all([
    supabase
      .from('listings')
      .select('*')
      .is('removed_at', null)
      .order('first_seen_at', { ascending: false })
      .limit(50),
    getActivityCount24h(),
    getActiveListingsCount(),
  ]);

  const listings = (listingsRes.data ?? []) as Listing[];

  return (
    <div className="min-h-screen bg-bg-0 text-ink-1">
      <StatusStrip count={activeListingsCount} />
      <TopBar activityCount={activityCount} />

      <main className="mx-auto grid max-w-[1400px] grid-cols-1 gap-6 px-6 py-6 lg:grid-cols-[1fr_280px]">
        <section>
          <header className="sticky top-0 z-10 -mx-6 border-b border-line-1 bg-bg-0/95 px-6 pb-4 pt-1 backdrop-blur">
            <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-3">
              Brúixola · Activitat
            </div>
            <h1 className="mt-1 font-display text-[28px] font-medium tracking-tight text-ink-0">
              Activitat
            </h1>
            <p className="mt-1 text-[13px] text-ink-2">
              Esdeveniments més recents · ordenats per data d&apos;aparició
            </p>

            {/* Filter chips */}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {CHIPS.map((c) => (
                <span
                  key={c.key}
                  aria-disabled={!c.active}
                  className={
                    c.active
                      ? 'inline-flex items-center rounded-sm border border-cyan-dim bg-cyan-dim/20 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-cyan'
                      : 'inline-flex cursor-not-allowed items-center rounded-sm border border-line-2 bg-bg-1 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3'
                  }
                  title={c.active ? undefined : 'Properament'}
                >
                  {c.label}
                  {!c.active && (
                    <span className="ml-1 text-ink-3">(properament)</span>
                  )}
                </span>
              ))}
            </div>
          </header>

          {listings.length === 0 ? (
            <div className="mt-6 flex h-64 items-center justify-center rounded-sm border border-dashed border-line-2 bg-bg-1 text-[14px] text-ink-2">
              Cap esdeveniment recent
            </div>
          ) : (
            <ul className="mt-4 flex flex-col">
              {listings.map((l) => (
                <li
                  key={l.id}
                  className="border-b border-line-1 last:border-b-0"
                >
                  <Link
                    href={`/listing/${l.id}`}
                    className="grid grid-cols-[80px_1fr_auto] items-center gap-4 px-2 py-3 transition-colors hover:bg-bg-1"
                  >
                    <div className="relative h-14 w-20 overflow-hidden rounded-sm border border-line-2 bg-bg-2">
                      {l.photos[0] ? (
                        <Image
                          src={l.photos[0]}
                          alt={l.address ?? l.id}
                          fill
                          sizes="80px"
                          className="object-cover"
                        />
                      ) : null}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge variant="info">Nova llista</Badge>
                        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">
                          {relativeCa(l.first_seen_at)}
                        </span>
                      </div>
                      <div className="mt-1 truncate text-[13px] text-ink-0">
                        {l.address ?? l.title ?? l.id}
                      </div>
                      <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">
                        {l.city_slug}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-[13px] tabular-nums text-amber">
                        {formatEur(l.price_eur)}
                      </div>
                      <div className="font-mono text-[11px] tabular-nums text-cyan">
                        {formatPct(l.gross_yield_pct_p50)}
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="flex flex-col gap-3">
          <section className="rounded-sm border border-line-1 bg-bg-1 p-4">
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">
              Últimes 24h
            </div>
            <div className="mt-2 font-display text-[28px] font-medium leading-none tabular-nums text-cyan">
              {activityCount}
            </div>
            <div className="mt-1 font-mono text-[11px] text-ink-2">
              esdeveniments
            </div>
          </section>
          <section className="rounded-sm border border-line-1 bg-bg-1 p-4">
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">
              Properament
            </div>
            <ul className="mt-2 flex cursor-not-allowed flex-col gap-1.5 text-[12px] text-ink-3">
              <li aria-disabled="true">· Detecció baixades de preu</li>
              <li aria-disabled="true">· Senyal &laquo;venut&raquo;</li>
              <li aria-disabled="true">· Alertes HUT</li>
              <li aria-disabled="true">· Alertes rent-cap</li>
            </ul>
          </section>
        </aside>
      </main>
    </div>
  );
}
