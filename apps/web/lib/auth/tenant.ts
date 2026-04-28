import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

/**
 * Auth + tenant resolution helpers for Server Components and Route Handlers.
 *
 *  - `getSession()` returns the Supabase auth user (or null) without redirecting.
 *  - `getMyTenantId()` calls the `get_my_tenant` RPC, returning the user's
 *    tenant uuid (or null).
 *  - `requireSession(returnTo)` is a hard gate — bounces anonymous users to
 *    /login with `next` set to where they came from.
 *  - `requireTenant(returnTo)` is the most common: bundles auth + tenant
 *    resolution and redirects to /login on failure.
 */
export async function getSession() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function getMyTenantId(): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('get_my_tenant');
  if (error) return null;
  return data ?? null;
}

export async function requireSession(returnTo: string = '/') {
  const user = await getSession();
  if (!user) redirect(`/login?next=${encodeURIComponent(returnTo)}`);
  return user;
}

export async function requireTenant(returnTo: string = '/') {
  const user = await requireSession(returnTo);
  const tenantId = await getMyTenantId();
  if (!tenantId) redirect('/login?error=no_tenant');
  return { user, tenantId };
}
