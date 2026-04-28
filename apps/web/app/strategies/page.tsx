import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import type { Strategy } from '@/lib/supabase/types';
import { TopBar } from '@/components/chrome/top-bar';
import { Badge } from '@/components/primitives/badge';
import { formatPct } from '@/lib/format';
import { t } from '@/lib/i18n';
import { getActiveListingsCount, getActivityCount24h } from '@/lib/activity';

/**
 * `/strategies` — investment thesis catalogue.
 *
 * Each strategy is a saved filter over the listings table. For Wave 4 we
 * approximate the matching count by reading three well-known shapes from
 * `filter_query` (city, max_price_eur, min_beds). Anything more exotic
 * renders as `—` rather than guessing — keeps the count honest.
 */

type FilterShape = {
  city?: string | string[];
  city_slug?: string | string[];
  max_price_eur?: number;
  min_beds?: number;
  beds_gte?: number;
};

function riskVariant(score: number | null): 'good' | 'warning' | 'critical' {
  if (score == null) return 'warning';
  if (score > 60) return 'critical';
  if (score >= 30) return 'warning';
  return 'good';
}

async function countMatching(
  supabase: Awaited<ReturnType<typeof createClient>>,
  filter: unknown,
): Promise<number | null> {
  if (!filter || typeof filter !== 'object') return null;
  const f = filter as FilterShape;

  // Bail out if the shape is entirely unknown.
  const recognised =
    f.city != null ||
    f.city_slug != null ||
    f.max_price_eur != null ||
    f.min_beds != null ||
    f.beds_gte != null;
  if (!recognised) return null;

  let query = supabase
    .from('listings')
    .select('id', { count: 'exact', head: true })
    .is('removed_at', null);

  const cityValue = f.city_slug ?? f.city;
  if (Array.isArray(cityValue)) {
    if (cityValue.length > 0) query = query.in('city_slug', cityValue);
  } else if (typeof cityValue === 'string' && cityValue.length > 0) {
    query = query.eq('city_slug', cityValue);
  }
  if (typeof f.max_price_eur === 'number')
    query = query.lte('price_eur', f.max_price_eur);
  const minBeds = f.min_beds ?? f.beds_gte;
  if (typeof minBeds === 'number') query = query.gte('beds', minBeds);

  const { count, error } = await query;
  if (error) return null;
  return count ?? 0;
}

export default async function StrategiesPage() {
  const supabase = await createClient();

  const [{ data }, activityCount, activeListingsCount] = await Promise.all([
    supabase
      .from('strategies')
      .select('*')
      .order('avg_yield_pct_p50', { ascending: false, nullsFirst: false }),
    getActivityCount24h(),
    getActiveListingsCount(),
  ]);

  const strategies = (data ?? []) as Strategy[];

  // Resolve counts in parallel — small set, single supabase client.
  const counts = await Promise.all(
    strategies.map((s) => countMatching(supabase, s.filter_query)),
  );

  return (
    <div className="min-h-screen bg-bg-0 text-ink-1">
      <TopBar activityCount={activityCount} />

      <main className="mx-auto max-w-[1400px] px-6 py-6">
        <header className="mb-6 border-b border-line-1 pb-4">
          <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-3">
            Brúixola · Tesis
          </div>
          <h1 className="mt-1 font-display text-[28px] font-medium tracking-tight text-ink-0">
            Estratègies d&apos;inversió
          </h1>
          <p className="mt-1 max-w-2xl text-[13px] text-ink-2">
            Filtres guardats sobre la base de dades. Cada tesi és una
            interpretació del mercat: lloguer residencial llarg, rotació
            d&apos;estudiantat, staff sanitari, curt termini amb HUT, reforma
            value-add o compra-revenda.
          </p>
        </header>

        {strategies.length === 0 ? (
          <div className="flex h-64 items-center justify-center rounded-sm border border-dashed border-line-2 bg-bg-1 text-[14px] text-ink-2">
            Encara no hi ha estratègies definides
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {strategies.map((s, idx) => {
              const variant = riskVariant(s.risk_score);
              const matchingCount = counts[idx];
              const postureLabel = t(s.yield_posture, 'yield_posture');

              return (
                <article
                  key={s.slug}
                  className="group flex flex-col gap-4 rounded-sm border border-line-1 bg-bg-1 p-5 transition-colors hover:border-line-3"
                >
                  <header className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h2 className="font-display text-[18px] font-medium leading-tight text-ink-0">
                        {s.title}
                      </h2>
                      <div className="mt-1 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">
                        {postureLabel}
                      </div>
                    </div>
                    <Badge variant={variant}>
                      RISC {s.risk_score ?? '—'}/100
                    </Badge>
                  </header>

                  <p className="line-clamp-4 text-[13px] leading-relaxed text-ink-1">
                    {s.thesis}
                  </p>

                  <div className="flex items-end justify-between gap-3 border-t border-line-1 pt-4">
                    <div>
                      <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">
                        Yield mitjà P50
                      </div>
                      <div className="font-display text-[26px] font-medium leading-none tabular-nums text-cyan">
                        {formatPct(s.avg_yield_pct_p50)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-[11px] tabular-nums text-ink-2">
                        {matchingCount == null
                          ? '—'
                          : `${matchingCount} pisos coincideixen`}
                      </div>
                      {matchingCount === 0 && (
                        <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">
                          Pendent d&apos;exemples
                        </div>
                      )}
                      <Link
                        href={`/listings?strategy=${s.slug}`}
                        className="mt-1 inline-block font-mono text-[12px] text-cyan hover:text-cyan-hot"
                      >
                        Obrir →
                      </Link>
                    </div>
                  </div>

                  <footer className="mt-auto">
                    <Link
                      href={`/listings?strategy=${s.slug}`}
                      className="block w-full rounded-sm border border-cyan-dim bg-cyan-dim/15 px-3 py-2 text-center font-mono text-[11px] uppercase tracking-[0.16em] text-cyan transition-colors hover:bg-cyan-dim/30"
                    >
                      Veure pisos →
                    </Link>
                  </footer>
                </article>
              );
            })}
          </div>
        )}

        {strategies.length > 0 && (
          <p className="mt-6 border-t border-line-1 pt-4 font-mono text-[11px] text-ink-3">
            Algunes propietats coincideixen amb més d&apos;una tesi.
          </p>
        )}
      </main>
    </div>
  );
}
