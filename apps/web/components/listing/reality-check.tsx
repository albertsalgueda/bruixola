/**
 * RealityCheck — the brutal one-line strip below the title.
 *
 * Compresses 4-6 decision-relevant signals into one band:
 *   €/m² delta vs city · legal rent cap · cashflow during mortgage ·
 *   rank vs saves · unresolved checks · freshness.
 *
 * Server-rendered. No client interactivity. Each fragment is self-hiding
 * when the data isn't there (no "—" placeholders).
 */

import { Badge } from '@/components/primitives/badge';
import { formatEur, formatNumber } from '@/lib/format';
import type { RankResult, UnknownChecks } from '@/lib/listing-rank';

const DOT = ' · ';

type Props = {
  /** % delta vs city median €/m². Negative = below market. */
  deltaPct: number | null;
  cityMedianEurM2: number | null;
  /** SERPAVI legal cap × m² × 12 / 12 = monthly cap, OR market rent × m² when not in ZMRT. */
  legalRentMonthlyCap: number | null;
  /** Whether the legal-cap figure comes from SERPAVI (ZMRT) or market fallback. */
  rentBasis: 'serpavi-legal' | 'market' | 'none';
  /** Net cashflow during mortgage (€/mo). Negative = doesn't autofinance. */
  cashflowDuring: number | null;
  rank: RankResult | null;
  unknowns: UnknownChecks;
  /** ISO date string of first_seen_at. */
  firstSeenAt: string | null;
};

function freshnessLabel(firstSeenAt: string | null): string | null {
  if (!firstSeenAt) return null;
  const days = Math.floor(
    (Date.now() - new Date(firstSeenAt).getTime()) / (1000 * 60 * 60 * 24),
  );
  if (days < 0) return null;
  if (days === 0) return 'avui';
  if (days === 1) return 'fa 1 dia';
  if (days < 14) return `fa ${days} dies`;
  if (days < 60) return `fa ${Math.round(days / 7)} setmanes`;
  if (days < 365) return `fa ${Math.round(days / 30)} mesos`;
  return `fa ${Math.round(days / 365)} anys`;
}

export function RealityCheck(props: Props) {
  const {
    deltaPct,
    cityMedianEurM2,
    legalRentMonthlyCap,
    rentBasis,
    cashflowDuring,
    rank,
    unknowns,
    firstSeenAt,
  } = props;

  const fresh = freshnessLabel(firstSeenAt);

  // Verdict tone: combine delta + cashflow into one severity signal.
  const verdictTone: 'good' | 'warning' | 'critical' | 'info' =
    cashflowDuring != null && cashflowDuring > 0 && deltaPct != null && deltaPct < -10
      ? 'good' // cheap AND autofinances
      : cashflowDuring != null && cashflowDuring < -300
        ? 'critical' // bleeds heavily during mortgage
        : deltaPct != null && deltaPct > 15
          ? 'warning' // priced above market
          : 'info';

  const verdictLabel =
    cashflowDuring != null && cashflowDuring > 0 && deltaPct != null && deltaPct < -10
      ? 'Autofinança · per sota mercat'
      : cashflowDuring != null && cashflowDuring < -300
        ? 'No autofinança · pressió mensual alta'
        : deltaPct != null && deltaPct > 15
          ? 'Preu per sobre mediana'
          : cashflowDuring != null && cashflowDuring > 0
            ? 'Autofinança'
            : 'Pendent verificar';

  return (
    <section
      aria-label="Reality check"
      className="rounded-sm border border-cyan-dim bg-bg-1 px-5 py-4"
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
        <Badge variant={verdictTone}>{verdictLabel}</Badge>

        {/* Delta vs city median */}
        {deltaPct != null && (
          <span className="font-mono text-[12px] tabular-nums text-ink-1">
            <span
              className={
                deltaPct < -7
                  ? 'text-green'
                  : deltaPct > 7
                    ? 'text-amber'
                    : 'text-cyan'
              }
            >
              {deltaPct < 0 ? `${Math.abs(deltaPct)}% per sota` : `${deltaPct}% per sobre`}
            </span>{' '}
            <span className="text-ink-3">mediana</span>
            {cityMedianEurM2 != null && (
              <span className="text-ink-3">
                {DOT}
                {formatNumber(Math.round(cityMedianEurM2))} €/m²
              </span>
            )}
          </span>
        )}

        {/* Legal rent cap */}
        {legalRentMonthlyCap != null && legalRentMonthlyCap > 0 && (
          <span className="font-mono text-[12px] tabular-nums text-ink-1">
            <span className="text-ink-3">
              {rentBasis === 'serpavi-legal' ? 'sostre SERPAVI' : 'lloguer mercat'}{' '}
            </span>
            <span className="text-ink-1">
              {formatEur(Math.round(legalRentMonthlyCap))}
            </span>
            <span className="text-ink-3">/mes</span>
          </span>
        )}

        {/* Cashflow during mortgage */}
        {cashflowDuring != null && (
          <span className="font-mono text-[12px] tabular-nums text-ink-1">
            <span className="text-ink-3">cashflow durant </span>
            <span
              className={
                cashflowDuring > 0
                  ? 'text-green'
                  : cashflowDuring < -200
                    ? 'text-red'
                    : 'text-amber'
              }
            >
              {cashflowDuring > 0 ? '+' : '−'}
              {formatEur(Math.round(Math.abs(cashflowDuring)))}/mes
            </span>
          </span>
        )}

        {/* Rank vs saves */}
        {rank != null && (
          <span className="font-mono text-[12px] tabular-nums text-ink-1">
            <span className="text-ink-3">ranks </span>
            <span className="text-cyan">
              #{rank.rank} de {rank.total}
            </span>
            <span className="text-ink-3"> dels teus pisos</span>
          </span>
        )}

        {/* Unresolved checks */}
        {unknowns.count > 0 && (
          <span className="font-mono text-[12px] tabular-nums">
            <span className="text-amber">{unknowns.count} per verificar</span>
            <span className="text-ink-3">
              {DOT}
              {unknowns.items
                .slice(0, 3)
                .map((i) => i.label.toLowerCase())
                .join(' · ')}
              {unknowns.items.length > 3 ? ' · …' : ''}
            </span>
          </span>
        )}

        {/* Freshness */}
        {fresh && (
          <span className="font-mono text-[12px] tabular-nums text-ink-3">
            primer cop {fresh}
          </span>
        )}
      </div>
    </section>
  );
}
