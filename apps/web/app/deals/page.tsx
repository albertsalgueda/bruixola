import Link from 'next/link';
import type { Route } from 'next';
import { requireTenant } from '@/lib/auth/tenant';
import { createClient } from '@/lib/supabase/server';
import { TopBar } from '@/components/chrome/top-bar';
import { Badge, type BadgeVariant } from '@/components/primitives/badge';
import { formatEur, formatDateRel } from '@/lib/format';
import type { Deal, PipelineStage, Property } from '@/lib/tenant-types';
import { createDealAtStage, stepDealStage } from './actions';

/**
 * `/deals` — pipeline kanban for the logged-in tenant.
 *
 * Server component. Drag-and-drop is intentionally out of scope for v1; each
 * card has small ←/→ buttons that call a server action stepping the deal
 * along the ordered `pipeline_stages` list. Terminal stages (`tancat`,
 * `descartat`) are reachable, the latter rendered dim because most analysts
 * browse forward, not into the dustbin.
 *
 * Time-in-stage drives the severity badge:
 *   <14d  → info (cool cyan, "healthy")
 *   <30d  → warning (amber, "check in")
 *   ≥30d  → critical (red, "stalled")
 */

type DealRow = Deal & {
  properties: Pick<
    Property,
    'id' | 'title' | 'address' | 'city_slug' | 'price_eur'
  > | null;
  agencies: { id: string; name: string } | null;
};

type PropertyOption = Pick<Property, 'id' | 'title' | 'address'>;

const VISIBLE_STAGE_ORDER = [
  'descobert',
  'en-revisio',
  'visitat',
  'oferta',
  'tancat',
] as const;

export default async function DealsPage() {
  const { tenantId } = await requireTenant('/deals');
  const supabase = await createClient();

  const oneMonthAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();

  const [stagesRes, dealsRes, propsRes, closedRes] = await Promise.all([
    supabase
      .from('pipeline_stages')
      .select('slug, name, name_es, ord, is_terminal')
      .order('ord', { ascending: true }),
    supabase
      .from('deals')
      .select(
        '*, properties(id, title, address, city_slug, price_eur), agencies(id, name)',
      )
      .eq('tenant_id', tenantId)
      .order('last_stage_change_at', { ascending: false }),
    supabase
      .from('properties')
      .select('id, title, address')
      .eq('tenant_id', tenantId)
      .is('archived_at', null)
      .order('created_at', { ascending: false }),
    supabase
      .from('deals')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .gte('closed_at', oneMonthAgo),
  ]);

  const stages = (stagesRes.data ?? []) as PipelineStage[];
  const deals = (dealsRes.data ?? []) as DealRow[];
  const properties = (propsRes.data ?? []) as PropertyOption[];
  const closedLast30 = closedRes.count ?? 0;

  const stageBySlug = new Map(stages.map((s) => [s.slug, s]));
  const dealsByStage = new Map<string, DealRow[]>();
  for (const d of deals) {
    const arr = dealsByStage.get(d.stage_slug) ?? [];
    arr.push(d);
    dealsByStage.set(d.stage_slug, arr);
  }

  const openCount = deals.filter(
    (d) => !stageBySlug.get(d.stage_slug)?.is_terminal,
  ).length;

  const visible = VISIBLE_STAGE_ORDER.map((slug) =>
    stageBySlug.get(slug),
  ).filter((s): s is PipelineStage => Boolean(s));
  const discardStage = stageBySlug.get('descartat');

  return (
    <div className="flex min-h-screen flex-col bg-bg-0 text-ink-1">
      <TopBar />

      <main className="mx-auto w-full max-w-[1480px] px-6 py-8">
        <header className="mb-6 flex items-end justify-between gap-6">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-cyan">
              PIPELINE
            </div>
            <h1 className="mt-2 font-display text-[26px] font-medium leading-tight tracking-tight text-ink-0">
              Pipeline
            </h1>
            <div className="mt-2 flex items-center gap-3 text-[12px] text-ink-2">
              <Badge variant="ghost-cyan">{openCount} oberts</Badge>
              <span className="text-ink-3">
                {closedLast30} tancats al darrer mes
              </span>
            </div>
          </div>
          <Link
            href={'/properties' as Route}
            className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3 hover:text-cyan"
          >
            Veure propietats →
          </Link>
        </header>

        {/* Desktop: traditional kanban grid */}
        <div
          className="hidden gap-3 md:grid"
          style={{
            gridTemplateColumns: `repeat(${visible.length}, minmax(220px, 1fr))`,
          }}
        >
          {visible.map((stage) => (
            <Column
              key={stage.slug}
              stage={stage}
              deals={dealsByStage.get(stage.slug) ?? []}
              properties={properties}
            />
          ))}
        </div>

        {/* Mobile: horizontal snap-scroll, one stage per panel */}
        <div className="md:hidden">
          <div
            className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
            aria-label="Etapes del pipeline"
          >
            {visible.map((stage) => (
              <div
                key={stage.slug}
                className="w-[88vw] max-w-[340px] shrink-0 snap-start"
              >
                <Column
                  stage={stage}
                  deals={dealsByStage.get(stage.slug) ?? []}
                  properties={properties}
                />
              </div>
            ))}
          </div>
          <p className="mt-2 px-1 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3">
            ← llisca per veure les altres etapes →
          </p>
        </div>

        {discardStage ? (
          <div className="mt-6 max-w-[260px] opacity-60">
            <Column
              stage={discardStage}
              deals={dealsByStage.get(discardStage.slug) ?? []}
              properties={properties}
              dim
            />
          </div>
        ) : null}
      </main>
    </div>
  );
}

function Column({
  stage,
  deals,
  properties,
  dim = false,
}: {
  stage: PipelineStage;
  deals: DealRow[];
  properties: PropertyOption[];
  dim?: boolean;
}) {
  return (
    <section
      className={`flex flex-col rounded-sm border border-line-1 bg-bg-1 ${
        dim ? 'opacity-80' : ''
      }`}
    >
      <header className="flex items-center justify-between gap-2 border-b border-line-1 px-3 py-2">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-cyan">
            {stage.name.toUpperCase()}
          </div>
          <div className="font-mono text-[10px] tabular-nums text-ink-3">
            {deals.length}
          </div>
        </div>
        <AddDealButton stageSlug={stage.slug} properties={properties} />
      </header>

      <ol className="flex flex-1 flex-col gap-2 p-2">
        {deals.length === 0 ? (
          <li className="px-2 py-6 text-center font-mono text-[10px] uppercase tracking-[0.16em] text-ink-4">
            Encara no hi ha cap deal en aquesta etapa.
          </li>
        ) : (
          deals.map((d) => <DealCard key={d.id} deal={d} />)
        )}
      </ol>
    </section>
  );
}

function DealCard({ deal }: { deal: DealRow }) {
  const ageDays = Math.floor(
    (Date.now() - new Date(deal.last_stage_change_at).getTime()) / 86_400_000,
  );
  const variant: BadgeVariant =
    ageDays >= 30 ? 'critical' : ageDays >= 14 ? 'warning' : 'info';

  const property = deal.properties;
  const title = property?.title ?? property?.address ?? 'Sense propietat';

  return (
    <li className="rounded-sm border border-line-1 bg-bg-2 px-3 py-2 hover:border-cyan-dim">
      {property ? (
        <Link
          href={`/properties/${property.id}` as Route}
          className="block text-[12px] font-medium text-ink-0 hover:text-cyan"
        >
          {title}
        </Link>
      ) : (
        <span className="block text-[12px] font-medium text-ink-2">
          {title}
        </span>
      )}
      {property?.address ? (
        <p className="mt-0.5 truncate text-[11px] text-ink-3">
          {property.address}
        </p>
      ) : null}

      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] tabular-nums text-ink-1">
          {property ? formatEur(property.price_eur) : '–'}
        </span>
        {deal.current_offer_eur != null ? (
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-cyan">
            Oferta {formatEur(deal.current_offer_eur)}
          </span>
        ) : null}
      </div>

      {deal.agencies?.name ? (
        <p className="mt-1 truncate text-[11px] text-ink-2">
          {deal.agencies.name}
        </p>
      ) : null}

      <div className="mt-2 flex items-center justify-between gap-2">
        <Badge variant={variant}>{ageDays}d</Badge>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">
          {formatDateRel(deal.last_stage_change_at)}
        </span>
      </div>

      <StageStepRow dealId={deal.id} />
    </li>
  );
}

function StageStepRow({ dealId }: { dealId: string }) {
  return (
    <div className="mt-2 flex items-center justify-between border-t border-line-1 pt-2">
      <form action={stepDealStage}>
        <input type="hidden" name="deal_id" value={dealId} />
        <input type="hidden" name="direction" value="prev" />
        <button
          type="submit"
          aria-label="Etapa anterior"
          className="border border-line-2 px-2 py-0.5 font-mono text-[11px] text-ink-2 hover:border-cyan-dim hover:text-cyan"
        >
          ←
        </button>
      </form>
      <form action={stepDealStage}>
        <input type="hidden" name="deal_id" value={dealId} />
        <input type="hidden" name="direction" value="next" />
        <button
          type="submit"
          aria-label="Etapa següent"
          className="border border-line-2 px-2 py-0.5 font-mono text-[11px] text-ink-2 hover:border-cyan-dim hover:text-cyan"
        >
          →
        </button>
      </form>
    </div>
  );
}

function AddDealButton({
  stageSlug,
  properties,
}: {
  stageSlug: string;
  properties: PropertyOption[];
}) {
  if (properties.length === 0) {
    return (
      <button
        type="button"
        disabled
        title="Afegeix una propietat primer."
        className="cursor-not-allowed border border-line-2 px-1.5 font-mono text-[12px] leading-none text-ink-4"
      >
        +
      </button>
    );
  }
  return (
    <details className="relative [&_summary::-webkit-details-marker]:hidden">
      <summary
        className="cursor-pointer border border-line-2 px-1.5 font-mono text-[12px] leading-none text-ink-2 hover:border-cyan-dim hover:text-cyan"
        title="Crear deal en aquesta etapa"
      >
        +
      </summary>
      <form
        action={createDealAtStage}
        className="absolute right-0 top-full z-10 mt-1 w-[260px] rounded-sm border border-line-2 bg-bg-2 p-2 shadow-lg"
      >
        <input type="hidden" name="stage_slug" value={stageSlug} />
        <label className="block">
          <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3">
            Propietat
          </span>
          <select
            name="property_id"
            required
            defaultValue=""
            className="w-full rounded-sm border border-line-2 bg-bg-1 px-2 py-1 text-[12px] text-ink-1 focus:border-cyan-dim focus:outline-none"
          >
            <option value="" disabled>
              Tria una propietat
            </option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title ?? p.address ?? p.id.slice(0, 8)}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="mt-2 w-full border border-cyan bg-cyan/15 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-cyan hover:bg-cyan/25"
        >
          Crear deal
        </button>
      </form>
    </details>
  );
}
