/**
 * Catalan-default translation maps for Brúixola enums.
 *
 * Code identifiers stay in English (per CLAUDE.md). User-facing strings are
 * Catalan. This module provides plain object maps plus a tiny `t()` helper
 * for ergonomic look-ups in server components. Keep this file dependency-free
 * — the translation surface is small enough that a runtime i18n library would
 * be overkill, and the JSON-Schema source of truth already constrains the
 * possible values per enum.
 *
 * If a key is missing we return the raw key. That makes drift visible in the
 * UI (the user sees the slug) instead of silently falling back to a generic
 * dash, which would hide bugs.
 */

import type {
  ConditionLabel,
  EnergyCert,
  HutMoratoriumStatus,
  OkupaRisk,
} from './supabase/types';
import type { OpportunityKind, OpportunityStatus } from './tenant-types';

export type YieldPosture =
  | 'long_let_residential'
  | 'long_let_student'
  | 'long_let_hospital_staff'
  | 'str_hut'
  | 'value_add_reform'
  | 'buy_and_flip';

export const conditionLabel: Record<ConditionLabel, string> = {
  reformado: 'Reformat',
  good: 'Bon estat',
  reform_needed: 'Cal reformar',
  wreck: 'Per enderrocar',
  unknown: 'Desconegut',
};

export const okupaRisk: Record<OkupaRisk, string> = {
  high: 'Risc alt',
  medium: 'Risc mitjà',
  low: 'Risc baix',
  unknown: 'Sense dades',
};

export const hutMoratoriumStatus: Record<HutMoratoriumStatus, string> = {
  active: 'Moratòria HUT activa',
  lifted: 'Moratòria HUT aixecada',
  none: 'Sense moratòria',
  unknown: 'Sense dades HUT',
};

export const yieldPosture: Record<YieldPosture, string> = {
  long_let_residential: 'Lloguer residencial llarg',
  long_let_student: 'Lloguer estudiantat',
  long_let_hospital_staff: 'Lloguer staff sanitari',
  str_hut: 'Curt termini · HUT',
  value_add_reform: 'Reforma value-add',
  buy_and_flip: 'Comprar i revendre',
};

export const energyCert: Record<EnergyCert, string> = {
  A: 'Classe A',
  B: 'Classe B',
  C: 'Classe C',
  D: 'Classe D',
  E: 'Classe E',
  F: 'Classe F',
  G: 'Classe G',
};

/**
 * Mono-caps labels for opportunity kinds, used as the chip headline above each
 * opportunity card on /opportunities. Stays Catalan, all-uppercase, terse.
 */
export const opportunityKind: Record<OpportunityKind, string> = {
  price_drop: 'BAIXADA DE PREU',
  new_match: 'NOVA COINCIDÈNCIA',
  serpavi_revision: 'REVISIÓ SERPAVI',
  zona_tensionada: 'ZONA TENSIONADA',
  agency_alert: 'ALERTA AGÈNCIA',
  visit_due: 'VISITA PROPERA',
  derrama_signal: 'SENYAL DERRAMA',
  hut_granted: 'HUT CONCEDIDA',
  other: 'ALTRE',
};

export const opportunityStatus: Record<OpportunityStatus, string> = {
  new: 'Nova',
  seen: 'Vista',
  acted: 'Actuada',
  dismissed: 'Descartada',
};

const namespaces = {
  condition_label: conditionLabel,
  okupa_risk: okupaRisk,
  hut_moratorium_status: hutMoratoriumStatus,
  yield_posture: yieldPosture,
  energy_cert: energyCert,
  opportunity_kind: opportunityKind,
  opportunity_status: opportunityStatus,
} as const;

export type Namespace = keyof typeof namespaces;

/**
 * Look up the Catalan label for a given enum value.
 *
 * Returns the raw key on miss so missing translations are visible in the UI
 * instead of being papered over.
 */
export function t(key: string, ns: Namespace): string {
  const map = namespaces[ns] as Record<string, string>;
  return map[key] ?? key;
}
