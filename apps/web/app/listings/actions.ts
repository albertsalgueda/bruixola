'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { Route } from 'next';
import { z } from 'zod';
import { requireTenant } from '@/lib/auth/tenant';
import { createClient } from '@/lib/supabase/server';

/**
 * Sanitise the return_to param against open-redirect: only same-origin paths
 * starting with `/`, no protocol-relative `//evil.com`. Falls back to /listings.
 */
function safeReturnTo(raw: string | undefined): Route {
  if (!raw) return '/listings' as Route;
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/listings' as Route;
  return raw as Route;
}

/**
 * Bridge actions between public listings and tenant-scoped properties.
 *
 *  - `trackListing(formData)` mints a `properties` row linked to the listing
 *    via `source_listing_id`, copying core fields. Idempotent — if the user
 *    already tracks the listing it no-ops.
 *  - `untrackListing(formData)` archives the property associated with a
 *    listing for this tenant. Reversible later by tracking again.
 *
 * Both require an authenticated session. Both gracefully bounce anonymous
 * visitors to `/login?next=/listings`.
 */

const TrackSchema = z.object({
  listing_id: z.string().min(6),
  // Optional — used to bring the user back to the same query state.
  return_to: z.string().optional(),
});

export async function trackListing(formData: FormData) {
  const { tenantId } = await requireTenant('/listings');
  const { listing_id, return_to } = TrackSchema.parse({
    listing_id: formData.get('listing_id'),
    return_to: formData.get('return_to') ?? undefined,
  });

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from('properties')
    .select('id, archived_at')
    .eq('tenant_id', tenantId)
    .eq('source_listing_id', listing_id)
    .maybeSingle();

  if (existing) {
    const row = existing as unknown as { id: string; archived_at: string | null };
    if (row.archived_at) {
      // Re-activate previously archived tracking.
      const { error } = await supabase
        .from('properties')
        .update({ archived_at: null } as never)
        .eq('id', row.id);
      if (error) throw new Error(error.message);
    }
    revalidatePath('/listings');
    revalidatePath('/properties');
    if (return_to) redirect(safeReturnTo(return_to));
    return;
  }

  const { data: src, error: srcErr } = await supabase
    .from('listings')
    .select(
      'id, city_slug, neighborhood_id, address, title, price_eur, m2, beds, baths, lift, energy_cert, year_built, in_zona_tensionada, rent_index_ceiling_eur_m2_mo, gross_yield_pct_p25, gross_yield_pct_p50, gross_yield_pct_p75, gross_yield_pct_legal_max, photos, url',
    )
    .eq('id', listing_id)
    .is('removed_at', null)
    .maybeSingle();
  if (srcErr) throw new Error(srcErr.message);
  if (!src) throw new Error(`Listing not found: ${listing_id}`);

  const s = src as unknown as Record<string, unknown>;
  const { error: insErr } = await supabase.from('properties').insert({
    tenant_id: tenantId,
    source_listing_id: s.id as string,
    source_url: s.url as string | null,
    city_slug: s.city_slug as string,
    neighborhood_id: (s.neighborhood_id as string | null) ?? null,
    address: s.address ?? null,
    title: s.title ?? s.address ?? null,
    price_eur: s.price_eur as number,
    m2: s.m2 ?? null,
    beds: s.beds ?? null,
    baths: s.baths ?? null,
    lift: s.lift ?? null,
    energy_cert: s.energy_cert ?? null,
    year_built: s.year_built ?? null,
    in_zona_tensionada: s.in_zona_tensionada ?? null,
    rent_index_ceiling_eur_m2_mo: s.rent_index_ceiling_eur_m2_mo ?? null,
    gross_yield_pct_p25: s.gross_yield_pct_p25 ?? null,
    gross_yield_pct_p50: s.gross_yield_pct_p50 ?? null,
    gross_yield_pct_p75: s.gross_yield_pct_p75 ?? null,
    gross_yield_pct_legal_max: s.gross_yield_pct_legal_max ?? null,
    photos: (s.photos as string[] | null) ?? [],
  } as never);
  if (insErr) throw new Error(insErr.message);

  revalidatePath('/listings');
  revalidatePath('/properties');
  if (return_to) redirect(safeReturnTo(return_to));
}

const UntrackSchema = z.object({
  listing_id: z.string().min(6),
  return_to: z.string().optional(),
});

export async function untrackListing(formData: FormData) {
  const { tenantId } = await requireTenant('/listings');
  const { listing_id, return_to } = UntrackSchema.parse({
    listing_id: formData.get('listing_id'),
    return_to: formData.get('return_to') ?? undefined,
  });

  const supabase = await createClient();
  const { error } = await supabase
    .from('properties')
    .update({ archived_at: new Date().toISOString() } as never)
    .eq('tenant_id', tenantId)
    .eq('source_listing_id', listing_id)
    .is('archived_at', null);
  if (error) throw new Error(error.message);

  revalidatePath('/listings');
  revalidatePath('/properties');
  if (return_to) redirect(safeReturnTo(return_to));
}
