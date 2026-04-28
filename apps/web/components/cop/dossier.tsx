import type {
  CityForMap,
  ComarcaGeo,
  GlobalSummary,
  PricePoint,
} from '@/lib/market';
import { comarcaStats } from '@/lib/market';
import { Badge } from '@/components/primitives/badge';
import { formatNumber } from '@/lib/format';
import { hutMoratoriumStatus, t } from '@/lib/i18n';

type Props = {
  cities: CityForMap[];
  comarques: ComarcaGeo[];
  latestByCity: Record<string, PricePoint>;
  summary: GlobalSummary;
  selectedCity: CityForMap | null;
  selectedComarca: ComarcaGeo | null;
};

// Dossier — left 320px panel.
// Pure server-rendered. Frames the situation in Catalan with severity badges,
// key/value mono rows, and four expandable details sections — populated from
// real public-market aggregates. No interactivity beyond <details> toggles.
export function Dossier({
  cities,
  comarques,
  latestByCity,
  summary,
  selectedCity,
  selectedComarca,
}: Props) {
  // Pick scope title + lat/lon stamp.
  const scope: 'city' | 'comarca' | 'global' = selectedCity
    ? 'city'
    : selectedComarca
      ? 'comarca'
      : 'global';

  const title =
    scope === 'city'
      ? selectedCity!.name
      : scope === 'comarca'
        ? selectedComarca!.name
        : 'Catalunya';

  const subtitle =
    scope === 'city'
      ? `Municipi · ${selectedCity!.province}`
      : scope === 'comarca'
        ? `Comarca · ${selectedComarca!.province}`
        : 'Vista global';

  // Severity logic: % of cities in zona tensionada
  const tensPct = summary.zonaTensionadaPct;
  const severityVariant: 'critical' | 'warning' | 'info' =
    tensPct > 70 ? 'critical' : tensPct > 30 ? 'warning' : 'info';
  const severityLabel = tensPct > 70 ? 'CRÍTIC' : tensPct > 30 ? 'TENS' : 'NORMAL';
  const severityToneRow: 'amber' | 'cyan' =
    tensPct > 30 ? 'amber' : 'cyan';

  return (
    <div className="scrollbar-thin flex h-full flex-col overflow-y-auto">
      {/* Section tabs (visual only) */}
      <div className="flex border-b border-line-1 px-5 pt-2 text-[11px]">
        <div className="-mb-px border-b-2 border-cyan py-2 pr-4 font-mono uppercase tracking-[0.16em] text-ink-0">
          Situacions
        </div>
        <div className="py-2 pr-4 font-mono uppercase tracking-[0.16em] text-ink-3">
          Ops
        </div>
        <div className="py-2 font-mono uppercase tracking-[0.16em] text-ink-3">
          Dades
        </div>
      </div>

      {/* Title + severity */}
      <div className="border-b border-line-1 px-5 py-4">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">
          {subtitle}
        </div>
        <h2 className="mt-1 font-display text-[19px] font-medium leading-tight text-ink-0">
          {title} · vista global
        </h2>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge variant={severityVariant}>{severityLabel}</Badge>
          <Badge variant="ghost-amber">
            {summary.zonaTensionadaCount} en zona tensionada
          </Badge>
        </div>
      </div>

      {/* Key/value rows */}
      <div className="border-b border-line-1 px-5 py-4">
        {scope === 'global' && (
          <>
            <KvRow k="Municipis" v={String(summary.cityCount)} />
            <KvRow k="Comarques" v={String(summary.comarcaCount)} />
            <KvRow
              k="% tensionada"
              v={`${tensPct.toFixed(0)}%`}
              tone={severityToneRow}
            />
            <KvRow
              k="Preu mitjà"
              v={
                summary.avgSaleEurM2 != null
                  ? `${formatNumber(Math.round(summary.avgSaleEurM2))} €/m²`
                  : '—'
              }
            />
            <KvRow
              k="Lloguer mitjà"
              v={
                summary.avgRentEurM2Mo != null
                  ? `${(Math.round(summary.avgRentEurM2Mo * 100) / 100).toFixed(2)} €/m²/mes`
                  : '—'
              }
            />
          </>
        )}
        {scope === 'comarca' && selectedComarca && (
          <ComarcaKv
            comarca={selectedComarca}
            cities={cities}
            latestByCity={latestByCity}
          />
        )}
        {scope === 'city' && selectedCity && (
          <CityKv city={selectedCity} latestByCity={latestByCity} />
        )}
      </div>

      {/* Expandable sections — populated with real numbers */}
      <Section title="Detalls" defaultOpen>
        <p className="text-[12px] leading-[1.55] text-ink-1">
          {scope === 'global'
            ? globalSummaryProse(summary, comarques.length)
            : scope === 'comarca' && selectedComarca
              ? comarcaProse(selectedComarca, cities, latestByCity)
              : selectedCity
                ? cityProse(selectedCity)
                : null}
        </p>
      </Section>

      <Section title="Intel·ligència">
        <p className="text-[12px] leading-[1.55] text-ink-2">
          Senyals creuats des de SERPAVI (sostre legal de lloguer), IDESCAT
          (població), i registre HUT de la Generalitat. Cobertura actual:{' '}
          <span className="font-mono text-ink-1">
            {countWithSale(cities, latestByCity)}/{summary.cityCount}
          </span>{' '}
          municipis amb sèrie mensual de preus.
        </p>
      </Section>

      <Section title="Activitat possible">
        <ul className="space-y-1.5 text-[12px] leading-[1.55] text-ink-2">
          <li>
            · Triangulació entre <span className="font-mono">Idealista</span>,{' '}
            <span className="font-mono">Fotocasa</span> i el sostre SERPAVI
          </li>
          <li>· Detecció de divergència real vs índex en zones tensionades</li>
          <li>· Cribrat de comarques sense moratòria HUT activa</li>
        </ul>
      </Section>

      <Section title="Plans de resposta" defaultOpen>
        <div className="space-y-2">
          <PlanCard
            tone={tensPct > 70 ? 'crit' : tensPct > 30 ? 'warn' : 'info'}
            title="Vigilància de zones tensionades"
            body={`${summary.zonaTensionadaCount} municipis amb sostre legal aplicable. Monitoritza divergència mensual entre lloguer real i sostre SERPAVI.`}
          />
          <PlanCard
            tone="info"
            title="Comparativa territorial"
            body="Selecciona municipis al mapa per comparar evolucions de preu i lloguer en sèries de 64 mesos."
          />
          <PlanCard
            tone="warn"
            title="Cobertura HUT"
            body="Verifica l'estat de les moratòries HUT abans de planificar tesi STR a la costa."
          />
        </div>
      </Section>

      <div className="flex-1" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scope-specific KV blocks
// ---------------------------------------------------------------------------
function ComarcaKv({
  comarca,
  cities,
  latestByCity,
}: {
  comarca: ComarcaGeo;
  cities: CityForMap[];
  latestByCity: Record<string, PricePoint>;
}) {
  const m = new Map<string, PricePoint>(Object.entries(latestByCity));
  const stats = comarcaStats(comarca.slug, cities, m);
  return (
    <>
      <KvRow k="Província" v={comarca.province} />
      <KvRow k="Població" v={formatNumber(stats.population)} />
      <KvRow k="Municipis" v={String(stats.memberCount)} />
      <KvRow
        k="Preu venda"
        v={
          stats.avgSaleEurM2 != null
            ? `${formatNumber(Math.round(stats.avgSaleEurM2))} €/m²`
            : '—'
        }
      />
      <KvRow
        k="Lloguer"
        v={
          stats.avgRentEurM2Mo != null
            ? `${(Math.round(stats.avgRentEurM2Mo * 100) / 100).toFixed(2)} €/m²/mes`
            : '—'
        }
      />
    </>
  );
}

function CityKv({
  city,
  latestByCity,
}: {
  city: CityForMap;
  latestByCity: Record<string, PricePoint>;
}) {
  const lp = latestByCity[city.slug] ?? null;
  return (
    <>
      <KvRow k="Comarca" v={city.comarca_slug} />
      <KvRow
        k="Població"
        v={city.population != null ? formatNumber(city.population) : '—'}
      />
      <KvRow
        k="Preu venda"
        v={
          lp?.sale_eur_m2 != null
            ? `${formatNumber(Math.round(lp.sale_eur_m2))} €/m²`
            : '—'
        }
      />
      <KvRow
        k="Lloguer"
        v={
          lp?.rent_eur_m2_mo != null
            ? `${lp.rent_eur_m2_mo.toFixed(2)} €/m²/mes`
            : '—'
        }
      />
      {city.in_zona_tensionada && (
        <KvRow
          k="Sostre"
          v={
            city.rent_index_eur_m2_mo != null
              ? `${city.rent_index_eur_m2_mo.toFixed(2)} €/m²/mes`
              : '—'
          }
          tone="amber"
        />
      )}
      <KvRow
        k="HUT"
        v={t(city.hut_moratorium_status, 'hut_moratorium_status')}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Prose generators (deterministic — no LLM, no fake numbers)
// ---------------------------------------------------------------------------
function globalSummaryProse(
  s: GlobalSummary,
  _comarcaCount: number,
): string {
  const avg =
    s.avgSaleEurM2 != null
      ? `${formatNumber(Math.round(s.avgSaleEurM2))} €/m²`
      : 'sense dades';
  const rent =
    s.avgRentEurM2Mo != null
      ? `${(Math.round(s.avgRentEurM2Mo * 100) / 100).toFixed(2)} €/m²/mes`
      : 'sense dades';
  return `${s.cityCount} municipis vigilats a Catalunya · ${s.zonaTensionadaCount} en zona tensionada (${s.zonaTensionadaPct.toFixed(0)}%). Preu mig de venda ${avg} · lloguer mig ${rent}.`;
}

function comarcaProse(
  c: ComarcaGeo,
  cities: CityForMap[],
  latestByCity: Record<string, PricePoint>,
): string {
  const m = new Map<string, PricePoint>(Object.entries(latestByCity));
  const s = comarcaStats(c.slug, cities, m);
  const avg =
    s.avgSaleEurM2 != null
      ? `${formatNumber(Math.round(s.avgSaleEurM2))} €/m²`
      : 'sense dades';
  return `${s.memberCount} municipis · població ${formatNumber(s.population)} · preu mig ${avg} · ${s.zonaTensionadaCount} en zona tensionada.`;
}

function cityProse(c: CityForMap): string {
  const flags: string[] = [];
  if (c.has_hospital) flags.push('hospital');
  if (c.has_university) flags.push('universitat');
  if (c.in_zona_tensionada) flags.push('tensionada');
  return `${c.name} · comarca ${c.comarca_slug} · població ${
    c.population != null ? formatNumber(c.population) : '—'
  }${flags.length > 0 ? ` · ${flags.join(' · ')}` : ''}.`;
}

function countWithSale(
  cities: CityForMap[],
  latestByCity: Record<string, PricePoint>,
): number {
  let n = 0;
  for (const c of cities) {
    if (latestByCity[c.slug]?.sale_eur_m2 != null) n += 1;
  }
  return n;
}

// ---------------------------------------------------------------------------
// Layout primitives
// ---------------------------------------------------------------------------
function KvRow({
  k,
  v,
  tone,
}: {
  k: string;
  v: string;
  tone?: 'amber' | 'cyan';
}) {
  const valueClass =
    tone === 'amber'
      ? 'text-amber'
      : tone === 'cyan'
        ? 'text-cyan'
        : 'text-ink-1';
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 font-mono text-[11px]">
      <span className="uppercase tracking-[0.14em] text-ink-3">{k}</span>
      <span className={valueClass}>{v}</span>
    </div>
  );
}

function Section({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details
      open={defaultOpen}
      className="group border-b border-line-1 px-5 py-3 [&_summary::-webkit-details-marker]:hidden"
    >
      <summary className="flex cursor-pointer items-center justify-between font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3 hover:text-ink-1">
        <h3 className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3 group-open:text-ink-1">
          {title}
        </h3>
        <span aria-hidden className="text-ink-3 transition-transform group-open:rotate-90">
          ›
        </span>
      </summary>
      <div className="pt-3">{children}</div>
    </details>
  );
}

function PlanCard({
  tone,
  title,
  body,
}: {
  tone: 'warn' | 'crit' | 'info';
  title: string;
  body: string;
}) {
  const stripeClass =
    tone === 'crit'
      ? 'before:bg-red'
      : tone === 'warn'
        ? 'before:bg-amber'
        : 'before:bg-cyan';
  return (
    <div
      className={`relative bg-bg-2 px-3 py-2.5 pl-4 before:absolute before:left-0 before:top-0 before:h-full before:w-[2px] before:content-[''] ${stripeClass}`}
    >
      <div className="text-[12px] font-medium text-ink-0">{title}</div>
      <div className="mt-1 text-[11px] leading-[1.5] text-ink-2">{body}</div>
    </div>
  );
}

// Re-export to silence unused-import warnings in environments where
// hutMoratoriumStatus is consumed via t() only.
export const _unusedReexport = hutMoratoriumStatus;
