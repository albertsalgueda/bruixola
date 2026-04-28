'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

/** Soft-revokes a tenant API key via the `revoke_api_key` RPC. */
export function RevokeApiKeyButton({ id, label }: { id: string; label: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    if (
      !window.confirm(
        `Revocar la clau "${label}"? Aquesta acció no es pot desfer.`,
      )
    ) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      const supabase = createClient();
      // Cast through `never` for the typed-RPC inference workaround — see
      // mint-api-key.tsx for the rationale.
      const { error: rpcError } = await supabase.rpc(
        'revoke_api_key' as never,
        { p_key_id: id } as never,
      );
      if (rpcError) {
        setError(rpcError.message);
        return;
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconegut.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="font-mono text-[10px] uppercase tracking-[0.18em] text-red hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? 'Revocant…' : 'Revocar'}
      </button>
      {error && (
        <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-red">
          {error}
        </span>
      )}
    </div>
  );
}
