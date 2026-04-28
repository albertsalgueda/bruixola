'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Badge } from '@/components/primitives/badge';

type Status =
  | { kind: 'idle' }
  | { kind: 'minting' }
  | { kind: 'minted'; token: string; label: string }
  | { kind: 'error'; message: string };

/**
 * Mint a new tenant API key. The plaintext token is shown ONCE — we keep it
 * in component state only until the user dismisses the dialog, at which
 * point we wipe it and trigger `router.refresh()` so the new key appears
 * in the server-rendered list above.
 */
export function MintApiKey({ tenantId }: { tenantId: string }) {
  const router = useRouter();
  const [label, setLabel] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [copied, setCopied] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = label.trim();
    if (!trimmed) {
      setStatus({ kind: 'error', message: "L'etiqueta és obligatòria." });
      return;
    }
    setStatus({ kind: 'minting' });
    try {
      const supabase = createClient();
      // Cast through `never` because postgrest-js's typed-RPC inference
      // collapses to `never` for our Database type — we know the runtime
      // contract from migration 012.
      const { data, error } = await supabase.rpc(
        'mint_api_key' as never,
        { p_tenant_id: tenantId, p_label: trimmed } as never,
      );
      if (error) {
        setStatus({ kind: 'error', message: error.message });
        return;
      }
      // RPC returns jsonb -> { id, token, label } — typed as that shape.
      const result = data as { id: string; token: string; label: string } | null;
      if (!result?.token) {
        setStatus({ kind: 'error', message: 'Resposta inesperada del servidor.' });
        return;
      }
      setStatus({ kind: 'minted', token: result.token, label: result.label });
    } catch (err) {
      setStatus({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Error desconegut.',
      });
    }
  }

  function dismiss() {
    // Defensive: clear plaintext token from React state before re-rendering.
    setStatus({ kind: 'idle' });
    setLabel('');
    setCopied(false);
    router.refresh();
  }

  async function copyToken() {
    if (status.kind !== 'minted') return;
    try {
      await navigator.clipboard.writeText(status.token);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard write can fail (insecure context, permissions). The user
      // can still select-and-copy the token text manually.
    }
  }

  if (status.kind === 'minted') {
    return (
      <div className="border border-cyan-dim bg-cyan-dim/10 p-5">
        <div className="flex items-center gap-2">
          <Badge variant="info">Clau creada</Badge>
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-2">
            {status.label}
          </span>
        </div>
        <p className="mt-3 text-[12px] leading-[1.55] text-ink-1">
          <strong className="text-red">
            Aquesta és l&apos;única vegada que veuràs la clau.
          </strong>{' '}
          Copia-la ara — després només podràs revocar-la.
        </p>
        <div className="mt-4 flex items-stretch gap-2">
          <code
            className="flex-1 select-all break-all rounded-sm border border-line-2 bg-bg-2 px-3 py-2 font-mono text-[12px] text-cyan"
            aria-label="Token API"
          >
            {status.token}
          </code>
          <button
            type="button"
            onClick={copyToken}
            className="flex shrink-0 items-center gap-1.5 border border-cyan bg-cyan/15 px-3 font-mono text-[10px] uppercase tracking-[0.18em] text-cyan hover:bg-cyan/25"
          >
            {copied ? (
              <>
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 14 14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-green"
                  aria-hidden
                >
                  <path d="M2 7.5 5.5 11 12 4" />
                </svg>
                <span className="text-green">Copiada</span>
              </>
            ) : (
              <span>Copia-la</span>
            )}
          </button>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="mt-5 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-2 hover:text-cyan"
        >
          Tancar →
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="border border-line-1 bg-bg-1 p-5">
      <div className="space-y-3">
        <label
          htmlFor="bx-key-label"
          className="block font-mono text-[10px] uppercase tracking-[0.18em] text-ink-2"
        >
          Etiqueta de la clau
        </label>
        <input
          id="bx-key-label"
          type="text"
          required
          value={label}
          onChange={(e) => {
            setLabel(e.target.value);
            if (status.kind === 'error') setStatus({ kind: 'idle' });
          }}
          placeholder="laptop-agent"
          className="w-full rounded-sm border border-line-2 bg-bg-2 px-3 py-2 text-[13px] text-ink-0 placeholder:text-ink-3 focus:border-cyan-dim focus:outline-none focus:ring-1 focus:ring-cyan-dim"
        />
        {status.kind === 'error' && (
          <div className="flex items-start gap-2">
            <Badge variant="ghost-red">Error</Badge>
            <p className="text-[12px] leading-[1.5] text-red">{status.message}</p>
          </div>
        )}
        <button
          type="submit"
          disabled={status.kind === 'minting'}
          className="border border-cyan bg-cyan/15 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-cyan hover:bg-cyan/25 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {status.kind === 'minting' ? 'Creant…' : 'Crear clau'}
        </button>
      </div>
    </form>
  );
}
