/**
 * Hand-rolled row types for the tenant-scoped tables.
 *
 * These tables (properties, deals, deal_notes, viewing_logs, opportunities,
 * agent_actions, pipeline_stages) are not yet present in the auto-generated
 * Supabase types in `./supabase/types.ts`. They will be regenerated when the
 * auth/tenant agent finalises its migrations. Until then, the shapes here
 * mirror the live DB columns documented in apps/web/CLAUDE.md / project
 * planning docs and let the page code stay strict-TS clean.
 *
 * Replace this file with `Database['public']['Tables']['…']['Row']` aliases
 * once the codegen catches up.
 */

import type { EnergyCert } from './supabase/types';

export type Property = {
  id: string;
  tenant_id: string;
  source_listing_id: string | null;
  source_url: string | null;
  city_slug: string;
  neighborhood_id: string | null;
  address: string | null;
  location: unknown;
  title: string | null;
  price_eur: number;
  m2: number | null;
  beds: number | null;
  baths: number | null;
  lift: boolean | null;
  energy_cert: EnergyCert | null;
  year_built: number | null;
  year_renovated: number | null;
  in_zona_tensionada: boolean | null;
  rent_index_ceiling_eur_m2_mo: number | null;
  gross_yield_pct_p25: number | null;
  gross_yield_pct_p50: number | null;
  gross_yield_pct_p75: number | null;
  gross_yield_pct_legal_max: number | null;
  photos: string[];
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

/** Joined city slice we typically pull alongside a property row. */
export type PropertyCityJoin = {
  cities: {
    name: string;
    comarca_slug: string;
  } | null;
};

export type Deal = {
  id: string;
  tenant_id: string;
  property_id: string;
  stage_slug: string;
  opened_at: string;
  last_stage_change_at: string;
  closed_at: string | null;
  closed_outcome: string | null;
  current_offer_eur: number | null;
  asking_eur: number | null;
  agency_id: string | null;
  agency_contact: string | null;
  agency_phone: string | null;
  summary: string | null;
  created_at: string;
  updated_at: string;
};

export type DealNote = {
  id: string;
  tenant_id: string;
  deal_id: string;
  body: string;
  author_kind: 'human' | 'agent';
  created_at: string;
};

export type ViewingLog = {
  id: string;
  tenant_id: string;
  property_id: string;
  deal_id: string | null;
  visited_at: string;
  attendees: string | null;
  notes: string | null;
  created_at: string;
};

export type OpportunityKind =
  | 'price_drop'
  | 'new_match'
  | 'serpavi_revision'
  | 'zona_tensionada'
  | 'agency_alert'
  | 'visit_due'
  | 'derrama_signal'
  | 'hut_granted'
  | 'other';

export type OpportunityStatus = 'new' | 'seen' | 'acted' | 'dismissed';
export type OpportunitySeverity = 'critical' | 'warning' | 'info';

export type Opportunity = {
  id: string;
  tenant_id: string;
  kind: OpportunityKind;
  status: OpportunityStatus;
  property_id: string | null;
  deal_id: string | null;
  city_slug: string | null;
  severity: OpportunitySeverity;
  title: string;
  body: string | null;
  detail: Record<string, unknown> | null;
  source: string | null;
  author_api_key_id: string | null;
  created_at: string;
};

export type PipelineStage = {
  slug: string;
  name: string;
  name_es: string | null;
  ord: number;
  is_terminal: boolean;
};
