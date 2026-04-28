import Link from 'next/link';
import Image from 'next/image';
import type { Route } from 'next';
import { notFound } from 'next/navigation';
import { requireTenant } from '@/lib/auth/tenant';
import { createClient } from '@/lib/supabase/server';
import { TopBar } from '@/components/chrome/top-bar';
import { Badge, type BadgeVariant } from '@/components/primitives/badge';
import { formatEur, formatM2, formatPct, formatDateRel } from '@/lib/format';
import { t } from '@/lib/i18n';
import type {
  Property,
  PropertyCityJoin,
  Deal,
  Opportunity,
  ViewingLog,
  OpportunitySeverity,
} from '@/lib/tenant-types';
import { archiveProperty, createDealForProperty } from '../actions';

/**
 * `/properties/[id]` — single-property dossier for the logged-in tenant.
 *
 * Header shows the property title + city link back to the COP. Two-column
 * body splits stats (left, narrow) from photos + relations (right, wide).
 * Relations: deals attached, opportunities, and viewing logs. Each relation
 * is its own card stack — never merged into a "timeline" — so the analyst
 * can scan each axis independently.
 */

const DASH = '–';

type PropertyRow = Property & PropertyCityJoin;

const SEVERITY_VARIANT: Record<OpportunitySeverity, BadgeVariant> = {
  critical: 'critical',
  warning: 'warning',
  info: 'info',
};

export default async function PropertyDetailPage({
  params,
}: {
  // Next 15: params is a Promise.
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { tenantId } = await requireTenant(`/properties/${id}`);
  const supabase = await createClient();

  const { data: propertyData } = await supabase
    .from('properties')
    .select('*, cities(name, comarca_slug)')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (!propertyData) notFound();
  const property = propertyData as PropertyRow;

  // Pull related deals, opportunities, and viewing logs in parallel.
  const [dealsRes, oppsRes, viewingsRes] = await Promise.all([
    supabase
      .from('deals')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('property_id', id)
      .order('last_stage_change_at', { ascending: false }),
    supabase
      .from('opportunities')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('property_id', id)
      .order('created_at', { ascending: false }),
    supabase
      .from('viewing_logs')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('property_id', id)
      .order('visited_at', { ascending: false }),
  ]);

  const deals = (dealsRes.data ?? []) as Deal[];
  const opps = (oppsRes.data ?? []) as Opportunity[];
  const viewings = (viewingsRes.data ?? []) as ViewingLog[];

  const cityName = property.cities?.name ?? property.city_slug;
  const eurPerM2 =
    property.m2 && property.m2 > 0
      ? Math.round(property.price_eur / property.m2)
      : null;

  return (
    <div className="flex min-h-screen flex-col bg-bg-0 text-ink-1">
      <TopBar />

      <main className="mx-auto w-full max-w-[1200px] px-6 py-8">
        <Link
          href={'/properties' as Route}
          className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3 hover:text-cyan"
        >
          ← Propietats
        </Link>

        <header className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-cyan">
              PROPIETAT · {property.id.slice(0, 8)}
            </div>
            <h1 className="mt-2 font-display text-[24px] font-medium leading-tight tracking-tight text-ink-0">
              {property.title ?? property.address ?? 'Sense títol'}
            </h1>
            <div className="mt-2 text-[12px] text-ink-2">
              <Link
                href={`/cop?city=${property.city_slug}` as Route}
                className="hover:text-cyan"
              >
                {cityName}
              </Link>
              {property.address ? (
                <span className="text-ink-3"> · {property.address}</span>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <form action={createDealForProperty}>
              <input type="hidden" name="property_id" value={property.id} />
              <button
                type="submit"
                className="border border-cyan bg-cyan/15 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.16em] text-cyan hover:bg-cyan/25"
              >
                + Crear deal
              </button>
            </form>
            <button
              type="button"
              disabled
              title="Pendent"
              className="border border-line-2 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.16em] text-ink-3"
            >
              Editar
            </button>
            <form action={archiveProperty}>
              <input type="hidden" name="id" value={property.id} />
              <button
                type="submit"
                className="border border-line-2 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.16em] text-ink-2 hover:border-amber-dim hover:text-amber"
              >
                Arxivar
              </button>
            </form>
          </div>
        </header>

        <div
          className="mt-6 grid gap-6"
          style={{ gridTemplateColumns: '320px 1fr' }}
        >
          {/* Stats column */}
          <aside className="space-y-3">
            <Card title="Resum">
              <Stat label="Preu" value={formatEur(property.price_eur)} />
              <Stat
                label="€/m²"
                value={eurPerM2 != null ? `€ ${eurPerM2}` : DASH}
              />
              <Stat label="Superfície" value={formatM2(property.m2)} />
              <Stat
                label="Habitacions"
                value={property.beds != null ? String(property.beds) : DASH}
              />
              <Stat
                label="Banys"
                value={property.baths != null ? String(property.baths) : DASH}
              />
              <Stat
                label="Any"
                value={
                  property.year_built != null ? String(property.year_built) : DASH
                }
              />
              <Stat
                label="Cert. energètic"
                value={
                  property.energy_cert
                    ? t(property.energy_cert, 'energy_cert')
                    : DASH
                }
              />
              <Stat
                label="Ascensor"
                value={
                  property.lift == null ? DASH : property.lift ? 'Sí' : 'No'
                }
              />
            </Card>

            <Card title="Yield">
              <Stat
                label="P25"
                value={formatPct(property.gross_yield_pct_p25)}
              />
              <Stat
                label="P50"
                value={formatPct(property.gross_yield_pct_p50)}
              />
              <Stat
                label="P75"
                value={formatPct(property.gross_yield_pct_p75)}
              />
              <Stat
                label="Sostre legal"
                value={formatPct(property.gross_yield_pct_legal_max)}
              />
              <div className="mt-2">
                {property.in_zona_tensionada === true ? (
                  <Badge variant="ghost-amber">ZONA TENSIONADA</Badge>
                ) : property.in_zona_tensionada === false ? (
                  <Badge variant="ghost-green">FORA DE ZONA</Badge>
                ) : null}
              </div>
            </Card>

            {property.source_url ? (
              <Card title="Origen">
                <a
                  href={property.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="block truncate font-mono text-[11px] text-cyan hover:text-cyan-hot"
                >
                  {property.source_url}
                </a>
              </Card>
            ) : null}
          </aside>

          {/* Right column */}
          <section className="space-y-6">
            {property.photos && property.photos.length > 0 ? (
              <PhotoGallery photos={property.photos} />
            ) : (
              <div className="rounded-sm border border-dashed border-line-2 bg-bg-1 px-6 py-10 text-center text-[12px] text-ink-3">
                Sense fotos
              </div>
            )}

            <RelatedDeals deals={deals} />
            <RelatedOpportunities opportunities={opps} />
            <RelatedViewings viewings={viewings} />
          </section>
        </div>
      </main>
    </div>
  );
}

function PhotoGallery({ photos }: { photos: string[] }) {
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
      {photos.slice(0, 9).map((url, i) => (
        <div
          key={`${url}-${i}`}
          className="relative aspect-[4/3] overflow-hidden rounded-sm border border-line-1 bg-bg-2"
        >
          {/* Use unoptimized; remote hosts vary and are not pre-allowlisted. */}
          <Image
            src={url}
            alt={`Foto ${i + 1}`}
            fill
            unoptimized
            sizes="(max-width: 768px) 50vw, 33vw"
            className="object-cover"
          />
        </div>
      ))}
    </div>
  );
}

function RelatedDeals({ deals }: { deals: Deal[] }) {
  return (
    <Card title={`Deals relacionats · ${deals.length}`}>
      {deals.length === 0 ? (
        <p className="text-[12px] text-ink-3">
          Cap deal vinculat. Crea&apos;n un per portar-la al pipeline.
        </p>
      ) : (
        <ul className="divide-y divide-line-1">
          {deals.map((d) => (
            <li
              key={d.id}
              className="flex items-center justify-between gap-3 py-2"
            >
              <div>
                <Badge variant="ghost-cyan">{d.stage_slug.toUpperCase()}</Badge>
                <span className="ml-2 font-mono text-[11px] text-ink-2">
                  Obert {formatDateRel(d.opened_at)}
                </span>
              </div>
              <div className="font-mono text-[11px] tabular-nums text-ink-2">
                {d.current_offer_eur != null
                  ? `Oferta ${formatEur(d.current_offer_eur)}`
                  : DASH}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function RelatedOpportunities({
  opportunities,
}: {
  opportunities: Opportunity[];
}) {
  return (
    <Card title={`Oportunitats · ${opportunities.length}`}>
      {opportunities.length === 0 ? (
        <p className="text-[12px] text-ink-3">Cap oportunitat oberta.</p>
      ) : (
        <ul className="divide-y divide-line-1">
          {opportunities.map((o) => (
            <li key={o.id} className="py-2">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Badge variant={SEVERITY_VARIANT[o.severity]}>
                    {t(o.kind, 'opportunity_kind')}
                  </Badge>
                  <span className="text-[12px] text-ink-1">{o.title}</span>
                </div>
                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3">
                  {formatDateRel(o.created_at)}
                </span>
              </div>
              {o.body ? (
                <p className="mt-1 text-[12px] text-ink-2">{o.body}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function RelatedViewings({ viewings }: { viewings: ViewingLog[] }) {
  return (
    <Card title={`Visites · ${viewings.length}`}>
      {viewings.length === 0 ? (
        <p className="text-[12px] text-ink-3">Encara no s&apos;ha visitat.</p>
      ) : (
        <ul className="divide-y divide-line-1">
          {viewings.map((v) => (
            <li key={v.id} className="py-2">
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-[11px] text-ink-1">
                  {new Date(v.visited_at).toLocaleString('ca-ES')}
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3">
                  {formatDateRel(v.visited_at)}
                </span>
              </div>
              {v.notes ? (
                <p className="mt-1 text-[12px] text-ink-2">{v.notes}</p>
              ) : null}
              {v.attendees ? (
                <p className="mt-0.5 text-[11px] text-ink-3">
                  Assistents: {v.attendees}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-sm border border-line-1 bg-bg-1 px-4 py-3">
      <h2 className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">
        {title}
      </h2>
      <div className="space-y-1.5">{children}</div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3">
        {label}
      </span>
      <span className="font-mono text-[12px] tabular-nums text-ink-1">
        {value}
      </span>
    </div>
  );
}
