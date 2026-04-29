/**
 * DecisionWorkflow — replaces the static UNVERIFIED checklist.
 *
 * Connects the listing dossier to the tenant workspace already in the
 * codebase (properties / deals / opportunities / viewing_logs).
 *
 * Three blocks:
 *   1. Rank vs saves (or "save 3 listings to unlock") — drives "is this
 *      worth my time vs my pipeline?"
 *   2. Unresolved checks list — explicit shortlist of cheap things to chase
 *      before bidding (cadastre, energy_cert, year_built, …).
 *   3. Action chips — Track / Visit log / Archive. The Track CTA already
 *      exists at the top of the page; this surface is the post-decision
 *      "what next" trigger.
 *
 * Premium-gated as a whole — anonymous users see blurred state with the
 * existing PaywallGate overlay.
 */

import Link from 'next/link';
import type { Route } from 'next';
import { Badge } from '@/components/primitives/badge';
import type { RankResult, UnknownChecks } from '@/lib/listing-rank';

type Props = {
  rank: RankResult | null;
  unknowns: UnknownChecks;
  /** True when the listing is already tracked by this tenant. */
  alreadyTracked: boolean;
  /** True when the listing has at least one viewing_logs row. */
  alreadyVisited: boolean;
  /** Whether to render the "save 3 listings to unlock" copy. */
  needsMoreSaves: boolean;
};

export function DecisionWorkflow({
  rank,
  unknowns,
  alreadyTracked,
  alreadyVisited,
  needsMoreSaves,
}: Props) {
  return (
    <section
      aria-label="Decision workflow"
      className="rounded-sm border border-line-1 bg-bg-1"
    >
      <header className="flex items-center justify-between border-b border-line-1 px-5 py-3">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">
          Què fer ara · workflow
        </h2>
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3">
          connectat a /properties · /deals
        </span>
      </header>

      <div className="grid grid-cols-1 gap-px bg-line-1 md:grid-cols-3">
        {/* 1. Rank vs saves */}
        <div className="bg-bg-1 p-5">
          <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3">
            Rànking dels teus pisos
          </div>
          {rank != null ? (
            <>
              <div className="mt-2 font-display text-[24px] font-medium leading-tight text-ink-0">
                #{rank.rank}
                <span className="ml-1 text-[14px] text-ink-3">de {rank.total}</span>
              </div>
              <p className="mt-1 font-mono text-[11px] text-ink-3">
                {rank.betterOnEurM2 === 0
                  ? 'El més barat €/m² del teu set actiu'
                  : `${rank.betterOnEurM2} pisos teus són més barats €/m²`}
              </p>
              <Link
                href={'/properties' as Route}
                className="mt-3 inline-block font-mono text-[10px] uppercase tracking-[0.14em] text-cyan hover:text-cyan-hot"
              >
                veure pipeline →
              </Link>
            </>
          ) : needsMoreSaves ? (
            <>
              <div className="mt-2 font-mono text-[11px] text-ink-2 leading-[1.55]">
                Desa almenys 3 anuncis per desbloquejar el rànking comparatiu.
              </div>
              <Link
                href={'/listings' as Route}
                className="mt-3 inline-block font-mono text-[10px] uppercase tracking-[0.14em] text-cyan hover:text-cyan-hot"
              >
                explorar anuncis →
              </Link>
            </>
          ) : (
            <div className="mt-2 font-mono text-[11px] text-ink-3">
              Inicia sessió per comparar amb el teu pipeline.
            </div>
          )}
        </div>

        {/* 2. Unresolved checks */}
        <div className="bg-bg-1 p-5">
          <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3">
            Per verificar
          </div>
          {unknowns.count === 0 ? (
            <>
              <div className="mt-2 font-display text-[20px] font-medium tracking-tight text-green">
                Tot verificat
              </div>
              <p className="mt-1 font-mono text-[11px] text-ink-3">
                No queden senyals febles a l'anunci.
              </p>
            </>
          ) : (
            <>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="font-display text-[24px] font-medium tracking-tight text-amber">
                  {unknowns.count}
                </span>
                <span className="font-mono text-[11px] text-ink-3">
                  {unknowns.count === 1 ? 'punt cec' : 'punts cecs'}
                </span>
              </div>
              <ul className="mt-2 space-y-1">
                {unknowns.items.slice(0, 5).map((it) => (
                  <li
                    key={it.key}
                    className="font-mono text-[11px] text-ink-2 before:mr-2 before:text-amber before:content-['·']"
                  >
                    {it.label}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        {/* 3. Status + actions */}
        <div className="bg-bg-1 p-5">
          <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3">
            Estat al teu pipeline
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge variant={alreadyTracked ? 'good' : 'info'}>
              {alreadyTracked ? 'Trackejat' : 'No trackejat'}
            </Badge>
            <Badge variant={alreadyVisited ? 'good' : 'info'}>
              {alreadyVisited ? 'Visitat' : 'Sense visita'}
            </Badge>
          </div>
          <p className="mt-3 font-mono text-[11px] leading-[1.55] text-ink-3">
            Si trackeges aquest pis es mou a /properties amb tots els senyals
            calculats. Després el pots avançar a /deals quan facis oferta.
          </p>
        </div>
      </div>
    </section>
  );
}
