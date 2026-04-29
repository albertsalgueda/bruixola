import Link from 'next/link';
import type { Route } from 'next';
import { requireTenant } from '@/lib/auth/tenant';
import { createClient } from '@/lib/supabase/server';
import { TopBar } from '@/components/chrome/top-bar';
import { Badge } from '@/components/primitives/badge';
import { CityCombobox } from '@/components/forms/city-combobox';
import {
  PropertiesMap,
  type PropertyMarker,
} from '@/components/properties/properties-map';
import { rowToCity, type CityForMap } from '@/lib/market';
import type { Property, PropertyCityJoin } from '@/lib/tenant-types';
import { formatEur, formatM2, formatPct } from '@/lib/format';
import { addProperty, archiveProperty } from './actions';

/**
 * `/properties` — tenant-scoped real properties.
 *
 * Server component. RLS does the tenant gating; we still pass `tenantId` to
 * `requireTenant()` so an unauthenticated visitor is bounced to /login before
 * any query runs. Each row is a real property the team is tracking — distinct
 * from `/listings`, which is the public discovery surface.
 */

const DASH = '–';

type PropertyRow = Property & PropertyCityJoin;

type TenantSlice = {
  slug: string;
  display_name: string;
};

type SearchParams = { view?: string };

export default async function PropertiesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { tenantId } = await requireTenant('/properties');
  const supabase = await createClient();
  const { view: rawView } = await searchParams;
  const view: 'table' | 'map' = rawView === 'map' ? 'map' : 'table';

  const [tenantRes, activeRes, archivedCountRes, citiesRes, cityCoordsRes] =
    await Promise.all([
      supabase
        .from('tenants')
        .select('slug, display_name')
        .eq('id', tenantId)
        .single<TenantSlice>(),
      supabase
        .from('properties')
        .select('*, cities(name, comarca_slug)')
        .eq('tenant_id', tenantId)
        .is('archived_at', null)
        .order('created_at', { ascending: false }),
      supabase
        .from('properties')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .not('archived_at', 'is', null),
      supabase
        .from('cities')
        .select('slug, name')
        .order('name', { ascending: true }),
      supabase.rpc('cities_for_map'),
    ]);

  const tenant = tenantRes.data ?? { slug: '—', display_name: '—' };
  const properties = (activeRes.data ?? []) as PropertyRow[];
  const archivedCount = archivedCountRes.count ?? 0;
  const cities = (citiesRes.data ?? []) as { slug: string; name: string }[];

  // City centroid lookup powers the map view (properties don't carry their
  // own lat/lng yet — `location` is reserved for a future geocoder pass).
  const cityCoords = (cityCoordsRes.data ?? []).map((r) =>
    rowToCity(r as unknown as Record<string, unknown>),
  ) as CityForMap[];
  const coordsBySlug = new Map(cityCoords.map((c) => [c.slug, c] as const));

  const markers: PropertyMarker[] = [];
  let unresolvedCount = 0;
  for (const p of properties) {
    const c = coordsBySlug.get(p.city_slug);
    if (!c) {
      unresolvedCount++;
      continue;
    }
    markers.push({
      id: p.id,
      title: p.title ?? p.address ?? p.id.slice(0, 8),
      address: p.address,
      city_slug: p.city_slug,
      city_name: p.cities?.name ?? c.name,
      lng: c.lng,
      lat: c.lat,
      price_eur: p.price_eur,
      m2: p.m2,
      beds: p.beds,
      yield_p50: p.gross_yield_pct_p50,
      in_zona_tensionada: p.in_zona_tensionada,
    });
  }

  return (
    <div className="flex min-h-screen flex-col bg-bg-0 text-ink-1">
      <TopBar />

      <main className="mx-auto w-full max-w-[1280px] px-6 py-8">
        <header className="mb-6 flex items-end justify-between gap-6">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-cyan">
              PROPIETATS · {tenant.slug}
            </div>
            <h1 className="mt-2 font-display text-[26px] font-medium leading-tight tracking-tight text-ink-0">
              Les teves propietats
            </h1>
            <div className="mt-2 flex items-center gap-3 text-[12px] text-ink-2">
              <Badge variant="ghost-cyan">
                {properties.length} actives
              </Badge>
              {archivedCount > 0 ? (
                <Link
                  href={'/properties?archived=1' as Route}
                  className="text-ink-3 hover:text-ink-1"
                >
                  Arxivades ({archivedCount})
                </Link>
              ) : (
                <span className="text-ink-4">Cap arxivada</span>
              )}
            </div>
          </div>
          <ViewToggle view={view} />
        </header>

        <AddPropertyPanel cities={cities} />

        {view === 'map' ? (
          properties.length === 0 ? (
            <EmptyState />
          ) : (
            <PropertiesMap
              markers={markers}
              unresolvedCount={unresolvedCount}
            />
          )
        ) : properties.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            {/* Desktop: dense table */}
            <div className="hidden md:block">
              <PropertyTable properties={properties} />
            </div>
            {/* Mobile: stacked card list */}
            <div className="flex flex-col gap-2 md:hidden">
              {properties.map((p) => (
                <PropertyMobileCard key={p.id} property={p} />
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function ViewToggle({ view }: { view: 'table' | 'map' }) {
  return (
    <div
      role="tablist"
      aria-label="Vista de propietats"
      className="flex items-stretch border border-line-1 bg-bg-1"
    >
      <ToggleLink href="/properties" active={view === 'table'} label="Taula" />
      <ToggleLink
        href="/properties?view=map"
        active={view === 'map'}
        label="Mapa"
      />
    </div>
  );
}

function ToggleLink({
  href,
  active,
  label,
}: {
  href: string;
  active: boolean;
  label: string;
}) {
  return (
    <Link
      href={href as Route}
      role="tab"
      aria-selected={active}
      className={
        'px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] ' +
        (active
          ? 'bg-cyan/15 text-cyan'
          : 'text-ink-3 hover:text-ink-1')
      }
    >
      {label}
    </Link>
  );
}

/** Inline collapsible add-property form. Uses a <details> for zero-JS collapse. */
function AddPropertyPanel({
  cities,
}: {
  cities: { slug: string; name: string }[];
}) {
  return (
    <details className="mb-6 rounded-sm border border-line-1 bg-bg-1 [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center border border-cyan bg-cyan/15 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.16em] text-cyan">
            + Afegir propietat
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">
            Manual · sense scraper
          </span>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">
          Obrir formulari
        </span>
      </summary>

      <form
        action={addProperty}
        className="grid gap-4 border-t border-line-1 px-4 py-5 sm:grid-cols-2 lg:grid-cols-3"
      >
        <Field label="Títol" name="title" required>
          <input
            type="text"
            name="title"
            required
            placeholder="Pis exterior · Eixample Esquerre"
            className={inputCls}
          />
        </Field>

        <Field label="Adreça" name="address">
          <input
            type="text"
            name="address"
            placeholder="C/ Aragó, 281"
            className={inputCls}
          />
        </Field>

        <Field label="Ciutat" name="city_slug" required>
          <CityCombobox cities={cities} required />
        </Field>

        <Field label="Preu (€)" name="price_eur" required>
          <input
            type="number"
            name="price_eur"
            required
            min={1}
            inputMode="numeric"
            placeholder="320000"
            className={inputCls}
          />
        </Field>

        <Field label="Superfície (m²)" name="m2">
          <input
            type="number"
            name="m2"
            min={1}
            inputMode="numeric"
            placeholder="78"
            className={inputCls}
          />
        </Field>

        <Field label="Habitacions" name="beds">
          <input
            type="number"
            name="beds"
            min={0}
            inputMode="numeric"
            placeholder="3"
            className={inputCls}
          />
        </Field>

        <Field label="Banys" name="baths">
          <input
            type="number"
            name="baths"
            min={0}
            inputMode="numeric"
            placeholder="2"
            className={inputCls}
          />
        </Field>

        <Field label="Ascensor" name="lift">
          <label className="inline-flex items-center gap-2 text-[12px] text-ink-2">
            <input
              type="checkbox"
              name="lift"
              className="h-3.5 w-3.5 accent-cyan"
            />
            Té ascensor
          </label>
        </Field>

        <Field label="Certificat energètic" name="energy_cert">
          <select name="energy_cert" className={inputCls} defaultValue="">
            <option value="">—</option>
            {(['A', 'B', 'C', 'D', 'E', 'F', 'G'] as const).map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Any de construcció" name="year_built">
          <input
            type="number"
            name="year_built"
            min={1500}
            max={2100}
            placeholder="1962"
            className={inputCls}
          />
        </Field>

        <Field label="URL d'origen" name="source_url">
          <input
            type="url"
            name="source_url"
            placeholder="https://..."
            className={inputCls}
          />
        </Field>

        <div className="sm:col-span-2 lg:col-span-3">
          <Field label="Fotos (una URL per línia)" name="photos">
            <textarea
              name="photos"
              rows={3}
              placeholder={'https://...\nhttps://...'}
              className={`${inputCls} resize-y font-mono text-[11px]`}
            />
          </Field>
        </div>

        <div className="sm:col-span-2 lg:col-span-3 flex items-center justify-end gap-3 border-t border-line-1 pt-4">
          <button
            type="reset"
            className="border border-line-2 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-2 hover:text-ink-0"
          >
            Reset
          </button>
          <button
            type="submit"
            className="border border-cyan bg-cyan/15 px-4 py-1.5 font-mono text-[11px] uppercase tracking-[0.16em] text-cyan hover:bg-cyan/25"
          >
            Crear propietat
          </button>
        </div>
      </form>
    </details>
  );
}

function EmptyState() {
  return (
    <div className="rounded-sm border border-dashed border-line-2 bg-bg-1 px-6 py-10 text-center">
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-cyan">
        Encara cap propietat
      </div>
      <p className="mx-auto mt-3 max-w-[520px] text-[13px] leading-[1.55] text-ink-2">
        Aquí veus els <span className="text-ink-0">anuncis que segueixes</span>:
        els que has marcat amb <span className="font-mono text-cyan">★</span> a{' '}
        <Link
          href={'/listings' as Route}
          className="text-cyan hover:text-cyan-hot"
        >
          Anuncis
        </Link>
        . Hi pots afegir notes, fotos pròpies i obrir-hi un deal.
      </p>
      <div className="mt-5 flex items-center justify-center gap-3">
        <Link
          href={'/listings' as Route}
          className="border border-cyan bg-cyan/15 px-4 py-1.5 font-mono text-[11px] uppercase tracking-[0.16em] text-cyan hover:bg-cyan/25"
        >
          Explorar anuncis →
        </Link>
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3">
          o afegeix-ne una manualment al panell de sobre
        </span>
      </div>
    </div>
  );
}

function PropertyTable({ properties }: { properties: PropertyRow[] }) {
  return (
    <div className="overflow-x-auto rounded-sm border border-line-1 bg-bg-1">
      <table className="w-full border-collapse text-left text-[12px]">
        <thead className="border-b border-line-1 bg-bg-2 text-ink-3">
          <tr>
            <Th>TÍTOL</Th>
            <Th>CIUTAT</Th>
            <Th align="right">€ PREU</Th>
            <Th align="right">m²</Th>
            <Th align="right">HAB</Th>
            <Th align="right">YIELD P50</Th>
            <Th>ZONA</Th>
            <Th>ESTAT</Th>
            <Th align="right">ACCIONS</Th>
          </tr>
        </thead>
        <tbody>
          {properties.map((p) => (
            <PropertyRow key={p.id} property={p} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Mobile-only stacked card per property. Single tap opens detail. */
function PropertyMobileCard({ property: p }: { property: PropertyRow }) {
  const cityName = p.cities?.name ?? p.city_slug;
  const overCeiling =
    p.gross_yield_pct_legal_max != null &&
    p.gross_yield_pct_p50 != null &&
    p.gross_yield_pct_p50 > p.gross_yield_pct_legal_max;

  return (
    <article className="border border-line-1 bg-bg-1">
      <Link
        href={`/properties/${p.id}` as Route}
        className="block px-4 py-3"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3">
              {cityName}
            </div>
            <div className="mt-1 line-clamp-2 text-[14px] text-ink-0">
              {p.title ?? p.address ?? p.id.slice(0, 8)}
            </div>
          </div>
          <div className="text-right">
            <div className="font-display text-[18px] font-medium tracking-tight text-ink-0">
              {formatEur(p.price_eur)}
            </div>
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">
              {formatM2(p.m2)}
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between border-t border-line-1 pt-3 text-[11px]">
          <div className="flex items-center gap-2">
            {p.in_zona_tensionada === true ? (
              <Badge variant="ghost-amber">TENSIONADA</Badge>
            ) : null}
            <Badge variant="ghost-cyan">ACTIVA</Badge>
          </div>
          <div className="flex items-center gap-2 font-mono tabular-nums">
            <span className="text-ink-3">YIELD P50</span>
            <span className={overCeiling ? 'text-amber' : 'text-cyan'}>
              {formatPct(p.gross_yield_pct_p50)}
            </span>
          </div>
        </div>

        {p.source_listing_id ? (
          <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">
            ↗ Anunci d&apos;origen
          </div>
        ) : null}
      </Link>
      <div className="border-t border-line-1 px-4 py-2">
        <form action={archiveProperty}>
          <input type="hidden" name="id" value={p.id} />
          <button
            type="submit"
            className="min-h-[36px] font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3 hover:text-amber"
          >
            Arxivar
          </button>
        </form>
      </div>
    </article>
  );
}

function PropertyRow({ property: p }: { property: PropertyRow }) {
  const cityName = p.cities?.name ?? p.city_slug;
  const overCeiling =
    p.gross_yield_pct_legal_max != null &&
    p.gross_yield_pct_p50 != null &&
    p.gross_yield_pct_p50 > p.gross_yield_pct_legal_max;

  return (
    <tr className="border-b border-line-0 hover:bg-bg-2">
      <Td>
        <Link
          href={`/properties/${p.id}` as Route}
          className="text-ink-1 hover:text-cyan"
        >
          {p.title ?? p.address ?? p.id.slice(0, 8)}
        </Link>
        {p.address && p.title ? (
          <div className="mt-0.5 text-[11px] text-ink-3">{p.address}</div>
        ) : null}
        {p.source_listing_id ? (
          <Link
            href={`/listing/${p.source_listing_id}` as Route}
            className="mt-0.5 inline-block font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3 hover:text-cyan"
            title="Veure l'anunci d'origen"
          >
            ↗ Anunci d&apos;origen
          </Link>
        ) : null}
      </Td>
      <Td>{cityName}</Td>
      <Td align="right" mono>
        {formatEur(p.price_eur)}
      </Td>
      <Td align="right" mono>
        {formatM2(p.m2)}
      </Td>
      <Td align="right" mono>
        {p.beds == null ? DASH : `${p.beds}/${p.baths ?? '–'}`}
      </Td>
      <Td align="right" mono>
        <span className={overCeiling ? 'text-amber' : undefined}>
          {formatPct(p.gross_yield_pct_p50)}
        </span>
      </Td>
      <Td>
        {p.in_zona_tensionada === true ? (
          <Badge variant="ghost-amber">TENSIONADA</Badge>
        ) : p.in_zona_tensionada === false ? (
          <Badge variant="ghost-green">LLIURE</Badge>
        ) : (
          <span className="text-ink-3">{DASH}</span>
        )}
      </Td>
      <Td>
        <Badge variant="ghost-cyan">ACTIVA</Badge>
      </Td>
      <Td align="right">
        <form action={archiveProperty}>
          <input type="hidden" name="id" value={p.id} />
          <button
            type="submit"
            className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3 hover:text-amber"
          >
            Arxivar
          </button>
        </form>
      </Td>
    </tr>
  );
}

const inputCls =
  'w-full rounded-sm border border-line-2 bg-bg-2 px-2 py-1.5 text-[12px] text-ink-1 placeholder:text-ink-3 focus:border-cyan-dim focus:outline-none';

function Field({
  label,
  name,
  required,
  children,
}: {
  label: string;
  name: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={name} className="block">
      <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3">
        {label}
        {required ? <span className="ml-1 text-amber">*</span> : null}
      </span>
      {children}
    </label>
  );
}

function Th({
  children,
  align = 'left',
}: {
  children: React.ReactNode;
  align?: 'left' | 'right';
}) {
  return (
    <th
      scope="col"
      className={`px-3 py-2 font-mono text-[10px] uppercase tracking-[0.16em] ${
        align === 'right' ? 'text-right' : 'text-left'
      }`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = 'left',
  mono = false,
}: {
  children: React.ReactNode;
  align?: 'left' | 'right';
  mono?: boolean;
}) {
  return (
    <td
      className={`px-3 py-2 align-top ${align === 'right' ? 'text-right' : ''} ${
        mono ? 'font-mono tabular-nums' : ''
      }`}
    >
      {children}
    </td>
  );
}
