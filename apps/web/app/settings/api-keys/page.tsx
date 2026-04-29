import { TopBar } from '@/components/chrome/top-bar';
import { createClient } from '@/lib/supabase/server';
import { requireTenant } from '@/lib/auth/tenant';
import { Badge } from '@/components/primitives/badge';
import { MintApiKey } from '@/components/settings/mint-api-key';
import { RevokeApiKeyButton } from '@/components/settings/revoke-api-key-button';
import type { TenantApiKey } from '@/lib/supabase/types';

// Slim row shape used by this page — matches the columns selected below. We
// cast to it because postgrest-js's select-string parser collapses to `never`
// for non-listings tables in the current generated Database type.
type ApiKeyRow = Pick<
  TenantApiKey,
  'id' | 'label' | 'scopes' | 'last_used_at' | 'created_at' | 'revoked_at'
>;

const DATE_FMT = new Intl.DateTimeFormat('ca-ES', {
  year: 'numeric',
  month: 'short',
  day: '2-digit',
});

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return DATE_FMT.format(new Date(iso));
  } catch {
    return '—';
  }
}

export default async function ApiKeysPage() {
  const { tenantId } = await requireTenant('/settings/api-keys');
  const supabase = await createClient();

  const { data: keys } = await supabase
    .from('tenant_api_keys')
    .select('id, label, scopes, last_used_at, created_at, revoked_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  const rows = (keys ?? []) as unknown as ApiKeyRow[];

  return (
    <div className="flex min-h-screen flex-col bg-bg-0 text-ink-1">
      <TopBar />

      <main className="mx-auto w-full max-w-[820px] flex-1 px-6 py-10">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-cyan">
          Ajustos · Claus API
        </div>
        <h1 className="mt-3 font-display text-[28px] font-medium leading-tight tracking-tight text-ink-0">
          Claus per a l&apos;agent
        </h1>
        <p className="mt-3 max-w-[640px] text-[13px] leading-[1.55] text-ink-2">
          Crea una clau{' '}
          <span className="font-mono text-cyan">brx_&lt;random&gt;</span> per
          al teu agent (OpenClaw, Claude Desktop, MCP…). La clau identifica
          l&apos;agent davant de l&apos;API i hereta els teus permisos. Cada
          clau es pot revocar en qualsevol moment.
        </p>

        <section className="mt-8">
          <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">
            Claus existents · {rows.length}
          </div>
          <div className="border border-line-1 bg-bg-1">
            {/* Desktop column headers — hidden on mobile */}
            <div
              className="hidden border-b border-line-1 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3 md:grid"
              style={{ gridTemplateColumns: '1.6fr 0.7fr 1fr 1fr 0.7fr' }}
            >
              <div>Label</div>
              <div>Estat</div>
              <div>Creat</div>
              <div>Últim ús</div>
              <div className="text-right">Revocar</div>
            </div>
            {rows.length === 0 && (
              <div className="px-4 py-6 text-center text-[12px] text-ink-3">
                Encara no tens cap clau. Crea&apos;n una a sota.
              </div>
            )}
            {rows.map((k) => {
              const revoked = k.revoked_at !== null;
              return (
                <div
                  key={k.id}
                  className="border-t border-line-1 first:border-t-0 md:first:border-t md:border-t"
                >
                  {/* Desktop: 5-column row */}
                  <div
                    className="hidden items-center px-4 py-3 text-[12px] md:grid"
                    style={{
                      gridTemplateColumns: '1.6fr 0.7fr 1fr 1fr 0.7fr',
                    }}
                  >
                    <div>
                      <div className="text-ink-0">{k.label}</div>
                      <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">
                        {(k.scopes ?? []).join(' · ') || 'no scopes'}
                      </div>
                    </div>
                    <div>
                      {revoked ? (
                        <Badge variant="ghost-red">Revocada</Badge>
                      ) : (
                        <Badge variant="ghost-green">Activa</Badge>
                      )}
                    </div>
                    <div className="font-mono text-ink-2">
                      {fmtDate(k.created_at)}
                    </div>
                    <div className="font-mono text-ink-2">
                      {fmtDate(k.last_used_at)}
                    </div>
                    <div className="flex justify-end">
                      {revoked ? (
                        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">
                          —
                        </span>
                      ) : (
                        <RevokeApiKeyButton id={k.id} label={k.label} />
                      )}
                    </div>
                  </div>

                  {/* Mobile: stacked card */}
                  <div className="md:hidden">
                    <div className="flex items-start justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <div className="text-[14px] text-ink-0">{k.label}</div>
                        <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">
                          {(k.scopes ?? []).join(' · ') || 'no scopes'}
                        </div>
                      </div>
                      {revoked ? (
                        <Badge variant="ghost-red">Revocada</Badge>
                      ) : (
                        <Badge variant="ghost-green">Activa</Badge>
                      )}
                    </div>
                    <dl className="grid grid-cols-2 gap-2 px-4 pb-3 text-[11px]">
                      <div>
                        <dt className="font-mono text-[9px] uppercase tracking-[0.16em] text-ink-3">
                          Creada
                        </dt>
                        <dd className="font-mono text-ink-2">
                          {fmtDate(k.created_at)}
                        </dd>
                      </div>
                      <div>
                        <dt className="font-mono text-[9px] uppercase tracking-[0.16em] text-ink-3">
                          Últim ús
                        </dt>
                        <dd className="font-mono text-ink-2">
                          {fmtDate(k.last_used_at)}
                        </dd>
                      </div>
                    </dl>
                    {!revoked && (
                      <div className="border-t border-line-1 px-4 py-2">
                        <RevokeApiKeyButton id={k.id} label={k.label} />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="mt-8">
          <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">
            Crear una nova clau
          </div>
          <MintApiKey tenantId={tenantId} />
        </section>

        <p className="mt-8 text-[11px] leading-[1.55] text-ink-3">
          Les claus es guarden com a hash SHA-256. La plaintext només es
          mostra una vegada al moment de la creació.
        </p>
      </main>
    </div>
  );
}
