/**
 * Rank-vs-saves: how does the subject listing compare to the user's last
 * N saved properties? Drives the "ranks #2 of your last 3 saves" line in
 * the Reality Check card.
 *
 * Returns null when the user has fewer than 3 saved properties (we surface
 * "save 3 listings to unlock ranking" copy in the UI).
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type RankResult = {
  rank: number;            // 1-indexed; 1 is best (cheapest €/m² vs city)
  total: number;           // includes this listing
  betterOnEurM2: number;   // listings cheaper €/m² than the subject
  betterOnYield: number;   // listings with higher yield_p50
  scope: 'eur_m2' | 'asking';
};

type SavedProperty = {
  id: string;
  source_listing_id: string | null;
  price_eur: number | null;
  m2: number | null;
};

/**
 * Server-only helper. Pass the supabase client + tenantId + the subject
 * listing's price_eur and m². Returns null if the user has < 3 active saves.
 */
export async function rankAgainstSaved(
  supabase: SupabaseClient,
  tenantId: string,
  subjectListingId: string,
  subjectEurM2: number | null,
): Promise<RankResult | null> {
  if (subjectEurM2 == null) return null;

  const { data: saves } = await supabase
    .from('properties')
    .select('id, source_listing_id, price_eur, m2')
    .eq('tenant_id', tenantId)
    .is('archived_at', null)
    .not('price_eur', 'is', null)
    .not('m2', 'is', null);
  const rows = (saves ?? []) as SavedProperty[];

  // Need at least 2 OTHER saves (3 total including the subject) to make a ranking
  // meaningful.
  const others = rows.filter((r) => r.source_listing_id !== subjectListingId);
  if (others.length < 2) return null;

  const all = [
    ...others.map((r) => ({
      eurM2: r.m2 && r.m2 > 0 && r.price_eur ? Number(r.price_eur) / Number(r.m2) : null,
    })),
    { eurM2: subjectEurM2 },
  ];
  const ranked = all
    .filter((r): r is { eurM2: number } => r.eurM2 != null)
    .sort((a, b) => a.eurM2 - b.eurM2);

  const subjectIdx = ranked.findIndex((r) => r.eurM2 === subjectEurM2);
  return {
    rank: subjectIdx + 1,
    total: ranked.length,
    betterOnEurM2: subjectIdx,
    betterOnYield: 0, // placeholder; saved properties don't carry yield today
    scope: 'eur_m2',
  };
}

/**
 * Count "unresolved checks" — the things we don't yet know about a listing
 * that an investor would chase before bidding. Drives the "2 unresolved
 * checks" badge.
 */
export type UnknownChecks = {
  count: number;
  items: Array<{
    key: string;
    label: string;
  }>;
};

export function countUnresolvedChecks(listing: {
  condition_label?: string | null;
  energy_cert?: string | null;
  year_built?: number | null;
  okupa_risk?: string | null;
  hut_license_id?: string | null;
  in_zona_tensionada?: boolean | null;
}): UnknownChecks {
  const items: UnknownChecks['items'] = [];
  if (!listing.condition_label || listing.condition_label === 'unknown') {
    items.push({ key: 'condition', label: 'Estat de l\'edifici' });
  }
  if (!listing.energy_cert) {
    items.push({ key: 'energy_cert', label: 'Certificat energètic' });
  }
  if (listing.year_built == null) {
    items.push({ key: 'year_built', label: 'Any de construcció' });
  }
  if (!listing.okupa_risk || listing.okupa_risk === 'unknown') {
    items.push({ key: 'okupa_risk', label: 'Risc okupacional' });
  }
  if (!listing.hut_license_id && listing.in_zona_tensionada === true) {
    // Only relevant in ZMRT — the absence of a HUT match means we haven't
    // verified whether STR is even legal here.
    items.push({ key: 'hut', label: 'Match HUT' });
  }
  return { count: items.length, items };
}
