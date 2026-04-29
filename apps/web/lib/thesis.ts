/**
 * Investment-thesis math for Brúixola listings.
 *
 * Three thesis vectors per listing:
 *   1. Cashflow (long-let buy-to-rent) — rent vs mortgage + opex.
 *   2. Appreciation (buy-and-hold) — projected sale value at horizons.
 *   3. Renovate + flip — reno cost vs uplift to city-median exit.
 *
 * All numbers are model estimates with explicit assumptions, NOT promises.
 * Per CLAUDE.md rule 2, when a listing is in a zona tensionada the rent used
 * is the SERPAVI legal cap (`rent_index_ceiling_eur_m2_mo`), never the
 * higher unrestricted market rent. The "yield_legal_max" caveat surfaces
 * directly in the cashflow output.
 *
 * No LLM in here. Deterministic regardless of locale, tabular-friendly.
 */

export type ThesisInput = {
  priceEur: number;
  m2: number | null;
  /** Best market-rent benchmark in €/m²/mo. Generalitat-derived if no SERPAVI. */
  rentEurM2Mo: number | null;
  /** SERPAVI legal cap in €/m²/mo. Only set when listing is in a zona tensionada. */
  rentLegalCapEurM2Mo: number | null;
  /** City median sale €/m² for the comp set. */
  cityMedianSaleEurM2: number | null;
  conditionLabel: 'reformado' | 'good' | 'reform_needed' | 'wreck' | 'unknown';
  inZonaTensionada: boolean | null;
};

// ── Spain-residential constants (Catalunya 2026 baseline) ───────────────
// Where there's a range, we pick a sensible mid-point and surface the
// assumption in a comment so reviewers see it.

/** ITP — Catalunya general rate for second-hand homes is 10% (Llei 5/2020). */
export const ITP_CAT = 0.10;
/** Notary + property registry + lawyer ≈ 1.5% combined (€2k–€4k typical). */
export const NOTARY_PCT = 0.015;
/** Banks lend up to 80% LTV to residents (less for non-residents/second homes). */
export const DOWN_PCT = 0.20;
/** Variable-rate mortgage TAE mid-2026: Euribor 12m ≈ 2.5% + 1% spread. */
export const MORTGAGE_RATE = 0.035;
/** 25-year term is the standard amortization in Spain. */
export const MORTGAGE_TERM_Y = 25;
/** IBI on cadastral value, ~0.3-0.5% of MARKET annually (cadastral ≈ 50% market). */
export const IBI_PCT_ANNUAL = 0.003;
/** Comunidad de propietarios: typical for a Catalan flat. Houses pay less. */
export const COMUNIDAD_MONTHLY = 100;
/** Building insurance premium per year. */
export const INSURANCE_ANNUAL = 300;
/** Maintenance reserve as % of price annually. */
export const MAINTENANCE_PCT_ANNUAL = 0.01;
/** Vacancy + non-payment reserve. */
export const VACANCY_RATE = 0.05;
/** Spain residential price growth, 1995–2024 nominal CAGR ≈ 3.5%. */
export const APPRECIATION_NOMINAL = 0.035;
/** Flip exit costs: 5% commission + 4% IRPF capital gains short-term + 1% other. */
export const FLIP_EXIT_COST_PCT = 0.10;
/** Time horizon for a flip operation. */
export const FLIP_RENO_MONTHS = 9;
/** Premium an "as-new" reformed unit gets vs city median (psychological + warranty). */
export const FLIP_EXIT_PREMIUM = 1.10;

/** Reno cost €/m² by current condition. Sources: Catalan reformer market 2025. */
export const RENO_COST_PER_M2: Record<ThesisInput['conditionLabel'], number> = {
  reformado: 0,
  good: 250,
  reform_needed: 1000,
  wreck: 2000,
  unknown: 600,
};

// ── Output shape ────────────────────────────────────────────────────────

export type ThesisOutput = {
  initial: {
    downPayment: number;
    itp: number;
    notary: number;
    totalCash: number;
    loan: number;
    monthlyMortgage: number;
  };
  operating: {
    opex: number;
    grossRentMonthly: number | null;
    /** Which rent figure was used: 'serpavi-legal' (ZMRT cap) or 'market' or null. */
    rentBasis: 'serpavi-legal' | 'market' | 'none';
  };
  cashflow: {
    during: number | null;     // monthly net cashflow during mortgage
    after: number | null;      // monthly net cashflow after mortgage paid
    /** Cash-on-cash annual return (net annual cashflow / total cash invested). */
    cocReturnPct: number | null;
    /** Years to recoup totalCash from cashflow alone (PER). */
    paybackYears: number | null;
  };
  appreciation: {
    yr5: number;
    yr10: number;
    yr25: number;
    /** Total return over 25y if held to mortgage end: (sale + cumulative cashflow) / totalCash. */
    holdReturnX: number | null;
  };
  flip: {
    renoCostPerM2: number;
    renoCost: number;
    exitPrice: number;
    carryCost: number;
    netProfit: number;
    /** Return on flip cash deployed (totalCash + renoCost + carryCost). */
    returnPct: number | null;
    months: number;
  };
  /** Surface the headline assumptions so the UI can show provenance. */
  assumptions: {
    mortgageRate: number;
    mortgageTermY: number;
    appreciation: number;
    vacancy: number;
    itp: number;
  };
  warnings: string[];
};

// ── Math ────────────────────────────────────────────────────────────────

function monthlyMortgagePayment(loan: number, annualRate: number, termY: number): number {
  const r = annualRate / 12;
  const n = termY * 12;
  if (r === 0) return loan / n;
  return (loan * r) / (1 - Math.pow(1 + r, -n));
}

export function computeThesis(input: ThesisInput): ThesisOutput {
  const {
    priceEur: price,
    m2,
    rentEurM2Mo,
    rentLegalCapEurM2Mo,
    cityMedianSaleEurM2,
    conditionLabel,
    inZonaTensionada,
  } = input;

  const warnings: string[] = [];

  // 1) Initial cash + mortgage
  const downPayment = price * DOWN_PCT;
  const itp = price * ITP_CAT;
  const notary = price * NOTARY_PCT;
  const totalCash = downPayment + itp + notary;
  const loan = price * (1 - DOWN_PCT);
  const monthlyMortgage = monthlyMortgagePayment(loan, MORTGAGE_RATE, MORTGAGE_TERM_Y);

  // 2) Operating costs (monthly)
  const ibiMonthly = (price * IBI_PCT_ANNUAL) / 12;
  const insuranceMonthly = INSURANCE_ANNUAL / 12;
  const maintenanceMonthly = (price * MAINTENANCE_PCT_ANNUAL) / 12;
  const opex = ibiMonthly + COMUNIDAD_MONTHLY + insuranceMonthly + maintenanceMonthly;

  // 3) Rent — SERPAVI legal cap if ZMRT (rule 2), else market.
  let rentBasis: ThesisOutput['operating']['rentBasis'] = 'none';
  let rentRate: number | null = null;
  if (inZonaTensionada && rentLegalCapEurM2Mo != null) {
    rentRate = rentLegalCapEurM2Mo;
    rentBasis = 'serpavi-legal';
  } else if (rentEurM2Mo != null) {
    rentRate = rentEurM2Mo;
    rentBasis = 'market';
    if (inZonaTensionada) {
      warnings.push(
        'Listing en zona tensionada però sense ceiling SERPAVI carregat — usant mercat com a fallback.',
      );
    }
  }
  const grossRentMonthly = rentRate != null && m2 ? rentRate * m2 : null;

  // 4) Cashflow
  let cashDuring: number | null = null;
  let cashAfter: number | null = null;
  let cocReturnPct: number | null = null;
  let paybackYears: number | null = null;
  if (grossRentMonthly != null) {
    const netRent = grossRentMonthly * (1 - VACANCY_RATE);
    cashDuring = netRent - opex - monthlyMortgage;
    cashAfter = netRent - opex;
    if (cashDuring > 0 && totalCash > 0) {
      cocReturnPct = ((cashDuring * 12) / totalCash) * 100;
      paybackYears = totalCash / (cashDuring * 12);
    } else if (cashDuring != null && cashDuring <= 0) {
      warnings.push('Cashflow durant la hipoteca és negatiu — la propietat no s\'autofinança.');
    }
  } else {
    warnings.push('Sense benchmark de lloguer per a la ciutat — cashflow no calculable.');
  }

  // 5) Appreciation projections
  const yr5 = price * Math.pow(1 + APPRECIATION_NOMINAL, 5);
  const yr10 = price * Math.pow(1 + APPRECIATION_NOMINAL, 10);
  const yr25 = price * Math.pow(1 + APPRECIATION_NOMINAL, 25);

  // 25-year hold return = (final equity + cumulative cashflow) / totalCash
  // Final equity ≈ sale_price (loan is fully amortized at year 25).
  let holdReturnX: number | null = null;
  if (cashDuring != null) {
    const cumCashflow25 = cashDuring * 12 * 25;
    const exitNet25 = yr25 * (1 - 0.05); // 5% sale costs, 25y old
    holdReturnX = (exitNet25 + cumCashflow25) / totalCash;
  }

  // 6) Flip thesis
  const renoUnit = RENO_COST_PER_M2[conditionLabel];
  const renoCost = m2 ? m2 * renoUnit : 0;
  const carryCost = FLIP_RENO_MONTHS * (monthlyMortgage + opex);
  // Exit price = city-median × m² × premium, OR if no benchmark fallback to
  // 1.15× the asking (assumes the reno itself adds 15%).
  const benchmarkM2 = cityMedianSaleEurM2 ?? (m2 && m2 > 0 ? price / m2 : null);
  const exitPrice =
    benchmarkM2 != null && m2 != null
      ? benchmarkM2 * m2 * FLIP_EXIT_PREMIUM
      : price * 1.15;
  const exitCosts = exitPrice * FLIP_EXIT_COST_PCT;
  const netProfit = exitPrice - exitCosts - price - renoCost - carryCost;
  const flipCashDeployed = totalCash + renoCost + carryCost;
  const flipReturnPct = flipCashDeployed > 0 ? (netProfit / flipCashDeployed) * 100 : null;
  if (renoUnit === 0) {
    warnings.push('Pis ja reformat — la tesi de flip té marge negatiu o nul.');
  }

  return {
    initial: { downPayment, itp, notary, totalCash, loan, monthlyMortgage },
    operating: { opex, grossRentMonthly, rentBasis },
    cashflow: { during: cashDuring, after: cashAfter, cocReturnPct, paybackYears },
    appreciation: { yr5, yr10, yr25, holdReturnX },
    flip: {
      renoCostPerM2: renoUnit,
      renoCost,
      exitPrice,
      carryCost,
      netProfit,
      returnPct: flipReturnPct,
      months: FLIP_RENO_MONTHS,
    },
    assumptions: {
      mortgageRate: MORTGAGE_RATE,
      mortgageTermY: MORTGAGE_TERM_Y,
      appreciation: APPRECIATION_NOMINAL,
      vacancy: VACANCY_RATE,
      itp: ITP_CAT,
    },
    warnings,
  };
}
