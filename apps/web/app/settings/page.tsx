import Link from 'next/link';
import type { Route } from 'next';
import { TopBar } from '@/components/chrome/top-bar';
import { createClient } from '@/lib/supabase/server';
import { requireTenant } from '@/lib/auth/tenant';
import type { Tenant, TenantUser } from '@/lib/supabase/types';

// Postgrest-js's select-string parser yields `never` for the tenant tables
// in the current generated Database type, so we cast to slim row shapes.
type TenantRow = Pick<Tenant, 'id' | 'slug' | 'display_name' | 'created_at'>;
type MembershipRow = Pick<TenantUser, 'role'>;

export default async function SettingsPage() {
  const { user, tenantId } = await requireTenant('/settings');
  const supabase = await createClient();

  const [{ data: tenantRaw }, { data: membershipRaw }] = await Promise.all([
    supabase
      .from('tenants')
      .select('id, slug, display_name, created_at')
      .eq('id', tenantId)
      .maybeSingle(),
    supabase
      .from('tenant_users')
      .select('role')
      .eq('tenant_id', tenantId)
      .eq('user_id', user.id)
      .maybeSingle(),
  ]);
  const tenant = tenantRaw as unknown as TenantRow | null;
  const membership = membershipRaw as unknown as MembershipRow | null;

  return (
    <div className="flex min-h-screen flex-col bg-bg-0 text-ink-1">
      <TopBar />

      <main className="mx-auto w-full max-w-[760px] flex-1 px-6 py-10">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-cyan">
          Ajustos · Brúixola
        </div>
        <h1 className="mt-3 font-display text-[28px] font-medium leading-tight tracking-tight text-ink-0">
          La teva configuració
        </h1>
        <p className="mt-3 text-[13px] leading-[1.55] text-ink-2">
          Gestiona el teu tenant, les claus per als agents i la sessió.
        </p>

        <section className="mt-9 space-y-3">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">
            El teu tenant
          </div>
          <div className="border border-line-1 bg-bg-1 p-5">
            <dl className="grid grid-cols-[120px_1fr] gap-y-2 text-[12px]">
              <dt className="font-mono uppercase tracking-[0.14em] text-ink-3">Nom</dt>
              <dd className="text-ink-0">{tenant?.display_name ?? '—'}</dd>
              <dt className="font-mono uppercase tracking-[0.14em] text-ink-3">Slug</dt>
              <dd className="font-mono text-cyan">{tenant?.slug ?? '—'}</dd>
              <dt className="font-mono uppercase tracking-[0.14em] text-ink-3">Rol</dt>
              <dd className="font-mono uppercase tracking-[0.14em] text-ink-1">
                {membership?.role ?? '—'}
              </dd>
              <dt className="font-mono uppercase tracking-[0.14em] text-ink-3">Correu</dt>
              <dd className="text-ink-0">{user.email}</dd>
            </dl>
          </div>
        </section>

        <section className="mt-9 space-y-3">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">
            Claus API
          </div>
          <Link
            href={'/settings/api-keys' as Route}
            className="block border border-line-1 bg-bg-1 p-5 hover:border-cyan-dim"
          >
            <div className="text-[14px] text-ink-0">Gestiona claus per a agents</div>
            <p className="mt-1 text-[12px] leading-[1.55] text-ink-2">
              Crea i revoca tokens <span className="font-mono text-cyan">brx_…</span> per a
              OpenClaw, Claude Desktop, MCP i altres clients.
            </p>
            <div className="mt-3 font-mono text-[10px] uppercase tracking-[0.18em] text-cyan">
              Anar a claus →
            </div>
          </Link>
        </section>

        <section className="mt-9 space-y-3">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">
            Sortir
          </div>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="border border-line-2 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-1 hover:border-red-dim hover:text-red"
            >
              Tancar sessió
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}
