'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireTenant } from '@/lib/auth/tenant';
import { createClient } from '@/lib/supabase/server';
import type { PipelineStage } from '@/lib/tenant-types';

/**
 * Server actions for the /deals kanban.
 *
 * The "advance / regress" pair operates on the ordered pipeline_stages list
 * we read from the DB. Terminal stages can still be reached, but cannot be
 * moved past their endpoint. RLS scopes by tenant_id at the row level; we
 * still pass `tenantId` into the equality predicate so an attacker who
 * forges a row id from another tenant gets a quiet 0-row update rather
 * than a "row is from another tenant" error.
 */

const CreateAtStageSchema = z.object({
  property_id: z.string().uuid(),
  stage_slug: z.string().min(1),
});

export async function createDealAtStage(formData: FormData) {
  const { tenantId } = await requireTenant('/deals');
  const { property_id, stage_slug } = CreateAtStageSchema.parse({
    property_id: formData.get('property_id'),
    stage_slug: formData.get('stage_slug'),
  });
  const supabase = await createClient();
  const now = new Date().toISOString();
  // `deals` is not yet in the codegen Database type — cast until regen.
  const { error } = await supabase.from('deals').insert({
    tenant_id: tenantId,
    property_id,
    stage_slug,
    opened_at: now,
    last_stage_change_at: now,
  } as never);
  if (error) throw new Error(error.message);
  revalidatePath('/deals');
}

const StepStageSchema = z.object({
  deal_id: z.string().uuid(),
  direction: z.enum(['next', 'prev']),
});

export async function stepDealStage(formData: FormData) {
  const { tenantId } = await requireTenant('/deals');
  const { deal_id, direction } = StepStageSchema.parse({
    deal_id: formData.get('deal_id'),
    direction: formData.get('direction'),
  });
  const supabase = await createClient();

  // Need ordered stages + current deal stage to compute the next slug.
  const [stagesRes, dealRes] = await Promise.all([
    supabase
      .from('pipeline_stages')
      .select('slug, name, name_es, ord, is_terminal')
      .order('ord', { ascending: true }),
    supabase
      .from('deals')
      .select('stage_slug')
      .eq('id', deal_id)
      .eq('tenant_id', tenantId)
      .maybeSingle(),
  ]);

  const stages = (stagesRes.data ?? []) as PipelineStage[];
  const current = (dealRes.data ?? null) as { stage_slug: string } | null;
  if (stages.length === 0 || !current) return;

  const idx = stages.findIndex((s) => s.slug === current.stage_slug);
  if (idx < 0) return;
  const target = direction === 'next' ? idx + 1 : idx - 1;
  if (target < 0 || target >= stages.length) return;
  const nextStage = stages[target]!.slug;

  const { error } = await supabase
    .from('deals')
    .update({
      stage_slug: nextStage,
      last_stage_change_at: new Date().toISOString(),
    } as never)
    .eq('id', deal_id)
    .eq('tenant_id', tenantId);
  if (error) throw new Error(error.message);
  revalidatePath('/deals');
}
