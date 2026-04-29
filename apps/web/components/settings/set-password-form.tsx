'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Badge } from '@/components/primitives/badge';

type Status =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'ok' }
  | { kind: 'error'; message: string };

const MIN_PASSWORD = 8;

/**
 * In-app password setter / changer. Works for two flows:
 *   1. User signed up via magic link → no password ever set → call updateUser
 *      to add one. From now on they can log in via the Contrasenya tab too.
 *   2. User already has a password → pick a new one.
 *
 * Supabase's `updateUser({ password })` only requires an authenticated session
 * (which the parent page guarantees via `requireSession`); it does NOT need
 * the current password. That's deliberate by Supabase — re-auth is what their
 * recovery / MFA flows protect against. Keep the form trivial; we add a
 * confirm field client-side just to catch typos.
 */
export function SetPasswordForm() {
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (pw.length < MIN_PASSWORD) {
      setStatus({
        kind: 'error',
        message: `La contrasenya ha de tenir com a mínim ${MIN_PASSWORD} caràcters.`,
      });
      return;
    }
    if (pw !== confirm) {
      setStatus({
        kind: 'error',
        message: 'Les contrasenyes no coincideixen.',
      });
      return;
    }

    setStatus({ kind: 'submitting' });
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) {
        setStatus({
          kind: 'error',
          message: error.message || 'Error inesperat.',
        });
        return;
      }
      setStatus({ kind: 'ok' });
      setPw('');
      setConfirm('');
    } catch {
      setStatus({
        kind: 'error',
        message: 'Error de xarxa. Comprova la connexió i torna a intentar-ho.',
      });
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <Field label="Nova contrasenya" id="bx-set-pw" hint={`Mínim ${MIN_PASSWORD} caràcters`}>
        <input
          id="bx-set-pw"
          type="password"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD}
          value={pw}
          onChange={(e) => {
            setPw(e.target.value);
            if (status.kind !== 'idle') setStatus({ kind: 'idle' });
          }}
          placeholder="••••••••"
          className={inputCls}
        />
      </Field>

      <Field label="Confirma la contrasenya" id="bx-set-pw-confirm">
        <input
          id="bx-set-pw-confirm"
          type="password"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD}
          value={confirm}
          onChange={(e) => {
            setConfirm(e.target.value);
            if (status.kind !== 'idle') setStatus({ kind: 'idle' });
          }}
          placeholder="••••••••"
          className={inputCls}
        />
      </Field>

      {status.kind === 'error' && (
        <div className="flex items-start gap-2">
          <Badge variant="ghost-red">Error</Badge>
          <p className="text-[12px] leading-[1.5] text-red">{status.message}</p>
        </div>
      )}

      {status.kind === 'ok' && (
        <div className="flex items-start gap-2">
          <Badge variant="ghost-green">Fet</Badge>
          <p className="text-[12px] leading-[1.5] text-green">
            Contrasenya actualitzada. Ja pots entrar amb email + contrasenya.
          </p>
        </div>
      )}

      <button
        type="submit"
        disabled={status.kind === 'submitting'}
        className="w-full border border-cyan bg-cyan/15 px-3 py-2.5 font-mono text-[11px] uppercase tracking-[0.18em] text-cyan hover:bg-cyan/25 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {status.kind === 'submitting' ? 'Desant…' : 'Desar contrasenya'}
      </button>
    </form>
  );
}

function Field({
  label,
  id,
  hint,
  children,
}: {
  label: string;
  id: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label
        htmlFor={id}
        className="block font-mono text-[10px] uppercase tracking-[0.18em] text-ink-2"
      >
        {label}
      </label>
      {children}
      {hint && (
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">
          {hint}
        </p>
      )}
    </div>
  );
}

const inputCls =
  'w-full rounded-sm border border-line-2 bg-bg-2 px-3 py-2 text-[13px] text-ink-0 placeholder:text-ink-3 focus:border-cyan-dim focus:outline-none focus:ring-1 focus:ring-cyan-dim';
