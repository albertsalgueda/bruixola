'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireTenant } from '@/lib/auth/tenant';
import { createClient } from '@/lib/supabase/server';

/**
 * Optional-string coercion: empty string → undefined, so Zod's `.optional()`
 * actually fires when the user leaves a form field blank.
 */
const emptyToUndef = (v: unknown) =>
  typeof v === 'string' && v.trim() === '' ? undefined : v;

const PhotosSchema = z.preprocess(
  (raw) => {
    if (typeof raw !== 'string') return [];
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  },
  z.array(z.string().url()).max(20),
);

const AddPropertySchema = z.object({
  title: z.preprocess(emptyToUndef, z.string().min(2).max(200)),
  address: z
    .preprocess(emptyToUndef, z.string().max(300).optional())
    .optional(),
  city_slug: z.string().min(1, 'Selecciona una ciutat de la llista'),
  price_eur: z.coerce.number().positive('Preu ha de ser > 0'),
  m2: z.preprocess(emptyToUndef, z.coerce.number().positive().optional()),
  beds: z.preprocess(emptyToUndef, z.coerce.number().int().min(0).optional()),
  baths: z.preprocess(emptyToUndef, z.coerce.number().int().min(0).optional()),
  lift: z.preprocess(
    (v) => v === 'on' || v === 'true' || v === true,
    z.boolean().optional(),
  ),
  energy_cert: z
    .preprocess(emptyToUndef, z.enum(['A', 'B', 'C', 'D', 'E', 'F', 'G']).optional())
    .optional(),
  year_built: z.preprocess(
    emptyToUndef,
    z.coerce.number().int().min(1500).max(2100).optional(),
  ),
  source_url: z.preprocess(emptyToUndef, z.string().url().optional()),
  photos: PhotosSchema,
});

export async function addProperty(formData: FormData) {
  const { tenantId } = await requireTenant('/properties');

  const raw = {
    title: formData.get('title'),
    address: formData.get('address'),
    city_slug: formData.get('city_slug'),
    price_eur: formData.get('price_eur'),
    m2: formData.get('m2'),
    beds: formData.get('beds'),
    baths: formData.get('baths'),
    lift: formData.get('lift'),
    energy_cert: formData.get('energy_cert'),
    year_built: formData.get('year_built'),
    source_url: formData.get('source_url'),
    photos: formData.get('photos') ?? '',
  };

  const parsed = AddPropertySchema.parse(raw);
  const supabase = await createClient();
  // `properties` is not yet in the codegen Database type. Cast the payload
  // until the auth/tenant agent regenerates types.ts.
  const { error } = await supabase
    .from('properties')
    .insert({ ...parsed, tenant_id: tenantId } as never);
  if (error) throw new Error(error.message);
  revalidatePath('/properties');
}

const ArchivePropertySchema = z.object({
  id: z.string().uuid(),
});

export async function archiveProperty(formData: FormData) {
  const { tenantId } = await requireTenant('/properties');
  const { id } = ArchivePropertySchema.parse({ id: formData.get('id') });
  const supabase = await createClient();
  const { error } = await supabase
    .from('properties')
    .update({ archived_at: new Date().toISOString() } as never)
    .eq('id', id)
    .eq('tenant_id', tenantId);
  if (error) throw new Error(error.message);
  revalidatePath('/properties');
}

const CreateDealForPropertySchema = z.object({
  property_id: z.string().uuid(),
});

export async function createDealForProperty(formData: FormData) {
  const { tenantId } = await requireTenant('/properties');
  const { property_id } = CreateDealForPropertySchema.parse({
    property_id: formData.get('property_id'),
  });
  const supabase = await createClient();
  const now = new Date().toISOString();
  const { error } = await supabase.from('deals').insert({
    tenant_id: tenantId,
    property_id,
    stage_slug: 'descobert',
    opened_at: now,
    last_stage_change_at: now,
  } as never);
  if (error) throw new Error(error.message);
  revalidatePath('/deals');
  revalidatePath(`/properties/${property_id}`);
}
