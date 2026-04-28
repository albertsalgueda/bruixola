'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireTenant } from '@/lib/auth/tenant';
import { createClient } from '@/lib/supabase/server';

const SetStatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['new', 'seen', 'acted', 'dismissed']),
});

/**
 * Set the status of a single opportunity. Server action invoked from each
 * card's action row. RLS scopes by tenant_id; we still pass tenantId in the
 * predicate so cross-tenant id forgery returns a no-op rather than an error.
 */
export async function setOpportunityStatus(formData: FormData) {
  const { tenantId } = await requireTenant('/opportunities');
  const { id, status } = SetStatusSchema.parse({
    id: formData.get('id'),
    status: formData.get('status'),
  });
  const supabase = await createClient();
  // `opportunities` is not yet in the codegen Database type — cast until regen.
  const { error } = await supabase
    .from('opportunities')
    .update({ status } as never)
    .eq('id', id)
    .eq('tenant_id', tenantId);
  if (error) throw new Error(error.message);
  revalidatePath('/opportunities');
}
