'use client';

import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type {
  CityForMap,
  ComarcaGeo,
  PricePoint,
  SelectedScope,
} from '@/lib/market';
import { cityInvestorStats, comarcaStats } from '@/lib/market';
import { Badge } from '@/components/primitives/badge';
import { formatNumber, formatPct } from '@/lib/format';
import { hutMoratoriumStatus, t } from '@/lib/i18n';
import { YieldBar } from '@/components/cop/yield-bar';

type Props = {
  selectedScope: SelectedScope;
  cities: CityForMap[];
  comarques: ComarcaGeo[];
  priceHistoryByCity: Record<string, PricePoint[]>;
  latestByCity: Record<string, PricePoint>;
};

// Render the right-hand panel (380px). Three states:
//   1. No selection → empty prompt with Catalonia outline
//   2. Comarca selected → header + stats grid for the comarca
//   3. City selected → header + stats grid + two Recharts time-series
export function MarketPanel({
  selectedScope,
  cities,
  comarques,
  priceHistoryByCity,
  latestByCity,
}: Props) {
  if (selectedScope.kind === null) {
    return <EmptyState />;
  }

  if (selectedScope.kind === 'comarca') {
    const c = comarques.find((x) => x.slug === selectedScope.id);
    if (!c) return <EmptyState />;
    return (
      <ComarcaView
        comarca={c}
        cities={cities}
        latestByCity={latestByCity}
      />
    );
  }

  // city
  const c = cities.find((x) => x.slug === selectedScope.id);
  if (!c) return <EmptyState />;
  const comarca = comarques.find((x) => x.slug === c.comarca_slug) ?? null;
  return (
    <CityView
      city={c}
      comarca={comarca}
      history={priceHistoryByCity[c.slug] ?? []}
    />
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------
function EmptyState() {
  return (
    <div className="scrollbar-thin flex h-full flex-col overflow-y-auto p-3">
      <div className="border border-line-1 bg-bg-2 px-4 py-8 text-center">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">
          Selecció buida
        </h2>
        {/* Tiny abstract Catalonia silhouette — 4 strokes, just enough to read */}
        <svg
          className="mx-auto mt-4 text-cyan-dim"
          width="56"
          height="56"
          viewBox="0 0 56 56"
          fill="none"
          aria-hidden
        >
          <path
            d="M10 14 L18 10 L28 12 L38 8 L46 16 L48 28 L40 38 L36 48 L24 46 L14 40 L8 30 L10 22 Z"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinejoin="round"
            fill="rgba(46,108,135,0.12)"
          />
        </svg>
        <div className="mt-4 font-display text-[15px] text-ink-1">
          Selecciona una comarca o un municipi
        </div>
        <div className="mt-2 text-[11px] leading-[1.5] text-ink-3">
          Clica una comarca al mapa per veure agregats territorials, o un punt
          cyan per obrir l&apos;evolució de preus de venda i lloguer al municipi.
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Comarca view
// ---------------------------------------------------------------------------
function ComarcaView({
  comarca,
  cities,
  latestByCity,
}: {
  comarca: ComarcaGeo;
  cities: CityForMap[];
  latestByCity: Record<string, PricePoint>;
}) {
  const stats = useMemo(() => {
    const m = new Map<string, PricePoint>(Object.entries(latestByCity));
    return comarcaStats(comarca.slug, cities, m);
  }, [comarca.slug, cities, latestByCity]);

  const tensPct =
    stats.memberCount === 0
      ? 0
      : (stats.zonaTensionadaCount / stats.memberCount) * 100;

  return (
    <div className="scrollbar-thin flex h-full flex-col gap-2 overflow-y-auto p-3">
      <div className="border border-line-1 bg-bg-2">
        <div className="border-b border-line-1 px-4 py-3">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">
            Comarca · {comarca.province}
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-3">
            <h2 className="font-display text-[20px] font-medium leading-tight text-ink-0">
              {comarca.name}
            </h2>
            {comarca.in_zona_tensionada ? (
              <Badge variant="ghost-amber">tensionada</Badge>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-3 gap-y-3 px-4 py-4">
          <Stat label="Població" value={formatNumber(stats.population)} />
          <Stat
            label="Municipis"
            value={String(stats.memberCount)}
            tone="cyan"
          />
          <Stat
            label="Preu venda"
            value={
              stats.avgSaleEurM2 != null
                ? `${formatNumber(Math.round(stats.avgSaleEurM2))} €/m²`
                : '—'
            }
          />
          <Stat
            label="Lloguer"
            value={
              stats.avgRentEurM2Mo != null
                ? `${formatNumber(
                    Math.round(stats.avgRentEurM2Mo * 100) / 100,
                  )} €/m²/mes`
                : '—'
            }
          />
          <Stat
            label="% tensionada"
            value={`${tensPct.toFixed(0)}%`}
            tone={tensPct > 50 ? 'amber' : 'ink'}
          />
          <Stat
            label="Cobertura preus"
            value={`${countWithSale(comarca.slug, cities, latestByCity)}/${stats.memberCount}`}
            tone="dim"
          />
          <Stat
            label="PER (anys recup.)"
            value={
              stats.perYears != null ? `${stats.perYears.toFixed(1)} anys` : '—'
            }
            tone={
              stats.perYears != null && stats.perYears <= 18 ? 'green' : 'ink'
            }
          />
          <Stat
            label="Lloguer vs sostre"
            value={formatPct(stats.rentVsCeilingPct)}
            tone={
              stats.rentVsCeilingPct != null && stats.rentVsCeilingPct > 0
                ? 'amber'
                : 'green'
            }
          />
        </div>

        <Footer />
      </div>

      <ChartCard
        title="Yield brut · municipis"
        subtitle={`${countWithSale(comarca.slug, cities, latestByCity)} municipis · P25–P75`}
      >
        <YieldBar
          p25={stats.yieldP25}
          p50={stats.yieldP50}
          p75={stats.yieldP75}
          legalMax={stats.legalMaxYieldPct}
          inZonaTensionada={comarca.in_zona_tensionada}
        />
      </ChartCard>
    </div>
  );
}

function countWithSale(
  comarcaSlug: string,
  cities: CityForMap[],
  latestByCity: Record<string, PricePoint>,
): number {
  let n = 0;
  for (const c of cities) {
    if (c.comarca_slug !== comarcaSlug) continue;
    if (latestByCity[c.slug]?.sale_eur_m2 != null) n += 1;
  }
  return n;
}

// ---------------------------------------------------------------------------
// City view
// ---------------------------------------------------------------------------
function CityView({
  city,
  comarca,
  history,
}: {
  city: CityForMap;
  comarca: ComarcaGeo | null;
  history: PricePoint[];
}) {
  const ceiling = city.in_zona_tensionada ? city.rent_index_eur_m2_mo : null;

  const investor = useMemo(() => cityInvestorStats(city, history), [city, history]);

  // Recharts wants plain objects. Reuse the same array reference across both
  // charts since the two series share an X axis.
  const chartData = useMemo(
    () =>
      history.map((p) => ({
        month: p.month,
        sale: p.sale_eur_m2,
        rent: p.rent_eur_m2_mo,
        ceiling: p.rent_index_eur_m2_mo,
      })),
    [history],
  );

  return (
    <div className="scrollbar-thin flex h-full flex-col gap-2 overflow-y-auto p-3">
      {/* Header card */}
      <div className="border border-line-1 bg-bg-2">
        <div className="border-b border-line-1 px-4 py-3">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">
            Municipi · {city.province}
            {comarca ? ` · ${comarca.name}` : ''}
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-3">
            <h2 className="font-display text-[20px] font-medium leading-tight text-ink-0">
              {city.name}
            </h2>
            {city.in_zona_tensionada ? (
              <Badge variant="ghost-amber">tensionada</Badge>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-3 gap-y-3 px-4 py-4">
          <Stat
            label="Població"
            value={
              city.population != null ? formatNumber(city.population) : '—'
            }
          />
          <Stat
            label="Trànsit"
            value={
              city.transit_score != null ? `${city.transit_score}/100` : '—'
            }
            tone={
              city.transit_score != null && city.transit_score >= 70
                ? 'cyan'
                : 'ink'
            }
          />
          <Stat
            label="Hospital"
            value={city.has_hospital ? 'Sí' : 'No'}
            tone={city.has_hospital ? 'green' : 'dim'}
          />
          <Stat
            label="Universitat"
            value={city.has_university ? 'Sí' : 'No'}
            tone={city.has_university ? 'green' : 'dim'}
          />
          <Stat
            label="Sostre SERPAVI"
            value={
              ceiling != null
                ? `${ceiling.toFixed(2)} €/m²/mes`
                : city.in_zona_tensionada
                  ? '—'
                  : 'N/A'
            }
            tone={ceiling != null ? 'amber' : 'dim'}
          />
          <Stat
            label="HUT"
            value={t(city.hut_moratorium_status, 'hut_moratorium_status')}
            tone={
              city.hut_moratorium_status === 'active'
                ? 'amber'
                : city.hut_moratorium_status === 'lifted'
                  ? 'green'
                  : 'dim'
            }
          />
        </div>
      </div>

      {/* Investor metrics card */}
      <div className="border border-line-1 bg-bg-2">
        <div className="border-b border-line-1 px-4 py-2">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-1">
            Mètriques d'inversió
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-3 px-4 py-4">
          <Stat
            label="Yield brut (P50)"
            value={formatPct(investor.yieldP50)}
            tone={
              investor.yieldP50 != null && investor.yieldP50 >= 5
                ? 'green'
                : investor.yieldP50 != null && investor.yieldP50 >= 3.5
                  ? 'cyan'
                  : 'ink'
            }
          />
          <Stat
            label="PER (anys recup.)"
            value={
              investor.perYears != null
                ? `${investor.perYears.toFixed(1)} anys`
                : '—'
            }
            tone={
              investor.perYears != null && investor.perYears <= 18
                ? 'green'
                : 'ink'
            }
          />
          <Stat
            label="YoY preu venda"
            value={formatPct(investor.saleYoYPct)}
            tone={
              investor.saleYoYPct != null && investor.saleYoYPct > 0
                ? 'cyan'
                : 'amber'
            }
          />
          <Stat
            label="YoY lloguer"
            value={formatPct(investor.rentYoYPct)}
            tone={
              investor.rentYoYPct != null && investor.rentYoYPct > 0
                ? 'cyan'
                : 'amber'
            }
          />
          {city.in_zona_tensionada && (
            <Stat
              label="Lloguer vs sostre"
              value={formatPct(investor.rentVsCeilingPct)}
              tone={
                investor.rentVsCeilingPct != null &&
                investor.rentVsCeilingPct > 0
                  ? 'amber'
                  : 'green'
              }
            />
          )}
          {city.in_zona_tensionada && (
            <Stat
              label="Yield legal màx."
              value={formatPct(investor.legalMaxYieldPct)}
              tone="dim"
            />
          )}
        </div>
        <div className="px-4 pb-4">
          <YieldBar
            p25={investor.yieldP25}
            p50={investor.yieldP50}
            p75={investor.yieldP75}
            legalMax={investor.legalMaxYieldPct}
            inZonaTensionada={city.in_zona_tensionada}
          />
        </div>
      </div>

      {/* Sale price chart */}
      <ChartCard
        title="Evolució del preu de venda"
        subtitle={`${chartData.length} mesos · €/m²`}
      >
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={140}>
            <AreaChart
              data={chartData}
              margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="bxFillSale" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#5fb4d4" stopOpacity={0.55} />
                  <stop offset="100%" stopColor="#5fb4d4" stopOpacity={0.04} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#1d3144" strokeDasharray="2 4" vertical={false} />
              <XAxis
                dataKey="month"
                tick={{ fill: '#54637a', fontSize: 9, fontFamily: 'var(--font-mono)' }}
                tickLine={false}
                axisLine={{ stroke: '#1d3144' }}
                interval={Math.max(1, Math.floor(chartData.length / 6))}
              />
              <YAxis
                tick={{ fill: '#54637a', fontSize: 9, fontFamily: 'var(--font-mono)' }}
                tickLine={false}
                axisLine={{ stroke: '#1d3144' }}
                domain={['auto', 'auto']}
                width={42}
              />
              <Tooltip content={<DarkTooltip kind="sale" />} cursor={{ stroke: '#2a4258' }} />
              <Area
                type="monotone"
                dataKey="sale"
                stroke="#5fb4d4"
                strokeWidth={1.6}
                fill="url(#bxFillSale)"
                isAnimationActive={false}
                connectNulls
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <NoData />
        )}
      </ChartCard>

      {/* Rent chart with optional ceiling overlay */}
      <ChartCard
        title="Evolució del lloguer"
        subtitle={
          city.in_zona_tensionada
            ? `${chartData.length} mesos · €/m²/mes · sostre SERPAVI`
            : `${chartData.length} mesos · €/m²/mes`
        }
      >
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={140}>
            <LineChart
              data={chartData}
              margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
            >
              <CartesianGrid stroke="#1d3144" strokeDasharray="2 4" vertical={false} />
              <XAxis
                dataKey="month"
                tick={{ fill: '#54637a', fontSize: 9, fontFamily: 'var(--font-mono)' }}
                tickLine={false}
                axisLine={{ stroke: '#1d3144' }}
                interval={Math.max(1, Math.floor(chartData.length / 6))}
              />
              <YAxis
                tick={{ fill: '#54637a', fontSize: 9, fontFamily: 'var(--font-mono)' }}
                tickLine={false}
                axisLine={{ stroke: '#1d3144' }}
                domain={['auto', 'auto']}
                width={42}
              />
              <Tooltip content={<DarkTooltip kind="rent" />} cursor={{ stroke: '#2a4258' }} />
              <Line
                type="monotone"
                dataKey="rent"
                stroke="#5fb4d4"
                strokeWidth={1.6}
                dot={false}
                isAnimationActive={false}
                connectNulls
              />
              {city.in_zona_tensionada && (
                <Line
                  type="monotone"
                  dataKey="ceiling"
                  stroke="#d04a3d"
                  strokeWidth={1.4}
                  strokeDasharray="4 3"
                  dot={false}
                  isAnimationActive={false}
                  connectNulls
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <NoData />
        )}

        {city.in_zona_tensionada && (
          <div className="mt-2 flex items-center gap-3 px-3 pb-2 font-mono text-[9px] uppercase tracking-[0.16em] text-ink-3">
            <span className="flex items-center gap-1.5">
              <span className="h-[2px] w-3 bg-cyan" /> lloguer real
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="h-[2px] w-3"
                style={{
                  background:
                    'repeating-linear-gradient(90deg, #d04a3d 0 4px, transparent 4px 7px)',
                }}
              />
              sostre legal
            </span>
          </div>
        )}
      </ChartCard>

      <Footer />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recharts custom dark tooltip
// ---------------------------------------------------------------------------
type RechartsTooltipPayload = {
  payload?: unknown;
  value?: unknown;
  dataKey?: string | number;
};

type DarkTooltipProps = {
  active?: boolean;
  label?: string | number;
  payload?: RechartsTooltipPayload[];
  kind: 'sale' | 'rent';
};

function DarkTooltip({ active, label, payload, kind }: DarkTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload as
    | { sale?: number | null; rent?: number | null; ceiling?: number | null }
    | undefined;
  if (!point) return null;
  return (
    <div className="border border-line-2 bg-bg-2 px-2.5 py-1.5 font-mono text-[10px] text-ink-1 shadow-md">
      <div className="text-ink-3">{String(label)}</div>
      {kind === 'sale' ? (
        <div className="mt-0.5">
          <span className="text-cyan">{fmtNum(point.sale)}</span>
          <span className="ml-1 text-ink-3">€/m²</span>
        </div>
      ) : (
        <>
          <div className="mt-0.5">
            <span className="text-cyan">{fmtNum(point.rent, 2)}</span>
            <span className="ml-1 text-ink-3">€/m²/mes</span>
          </div>
          {point.ceiling != null && (
            <div className="mt-0.5">
              <span className="text-red">{fmtNum(point.ceiling, 2)}</span>
              <span className="ml-1 text-ink-3">sostre</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function fmtNum(n: number | null | undefined, digits = 0): string {
  if (n == null) return '—';
  return n.toLocaleString('ca-ES', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

// ---------------------------------------------------------------------------
// Layout primitives
// ---------------------------------------------------------------------------
function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-line-1 bg-bg-2">
      <div className="flex items-baseline justify-between border-b border-line-1 px-4 py-2">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-1">
          {title}
        </div>
        <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-ink-3">
          {subtitle}
        </div>
      </div>
      <div className="px-1 py-2">{children}</div>
    </div>
  );
}

function NoData() {
  return (
    <div className="px-4 py-6 text-center font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3">
      Sense sèrie disponible
    </div>
  );
}

function Footer() {
  return (
    <div className="border-t border-line-1 px-4 py-2 font-mono text-[9px] uppercase tracking-[0.16em] text-ink-3">
      Dades · Idealista · Fotocasa · IDESCAT · SERPAVI · BOE
    </div>
  );
}

function Stat({
  label,
  value,
  tone = 'ink',
}: {
  label: string;
  value: string;
  tone?: 'ink' | 'cyan' | 'amber' | 'green' | 'dim';
}) {
  const valueClass =
    tone === 'cyan'
      ? 'text-cyan'
      : tone === 'amber'
        ? 'text-amber'
        : tone === 'green'
          ? 'text-green'
          : tone === 'dim'
            ? 'text-ink-3'
            : 'text-ink-0';
  return (
    <div>
      <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-3">
        {label}
      </div>
      <div className={`mt-1 font-mono text-[12px] ${valueClass}`}>{value}</div>
    </div>
  );
}

// Suppress unused (pulled from i18n module for downstream consumers)
export const _hutMoratoriumStatusReexport = hutMoratoriumStatus;
