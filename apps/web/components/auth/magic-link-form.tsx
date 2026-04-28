'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Badge } from '@/components/primitives/badge';

type Status =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'sent'; email: string }
  | { kind: 'error'; message: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Magic-link sign-in form. Calls `signInWithOtp`, redirects back through
 * `/auth/callback?next=<next>` so the user lands wherever they were
 * trying to go (or `/properties` by default).
 */
export function MagicLinkForm({ next }: { next: string }) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = email.trim();

    if (!EMAIL_RE.test(trimmed)) {
      setStatus({ kind: 'error', message: 'Format de correu invàlid.' });
      return;
    }

    setStatus({ kind: 'sending' });

    try {
      const supabase = createClient();
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
      const { error } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: { emailRedirectTo: redirectTo },
      });

      if (error) {
        const msg = /rate/i.test(error.message)
          ? 'Massa intents — espera uns minuts abans de tornar-ho a provar.'
          : error.message || 'Error inesperat enviant el correu.';
        setStatus({ kind: 'error', message: msg });
        return;
      }

      setStatus({ kind: 'sent', email: trimmed });
    } catch {
      setStatus({
        kind: 'error',
        message: 'Error de xarxa. Comprova la connexió i torna a intentar-ho.',
      });
    }
  }

  if (status.kind === 'sent') {
    return (
      <div className="space-y-5">
        <Badge variant="ghost-cyan">Correu enviat</Badge>
        <p className="text-[13px] leading-[1.55] text-ink-1">
          Comprova el correu — t&apos;hem enviat un enllaç a{' '}
          <span className="font-mono text-cyan">{status.email}</span>.
        </p>
        <p className="text-[12px] leading-[1.55] text-ink-3">
          L&apos;enllaç caduca en 1 hora. Si no el trobes, mira la carpeta de
          correu brossa.
        </p>
        <button
          type="button"
          onClick={() => {
            setStatus({ kind: 'idle' });
            setEmail('');
          }}
          className="font-mono text-[10px] uppercase tracking-[0.18em] text-cyan hover:text-cyan-hot"
        >
          ← Tornar al formulari
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div className="space-y-2">
        <label
          htmlFor="bx-login-email"
          className="block font-mono text-[10px] uppercase tracking-[0.18em] text-ink-2"
        >
          Correu
        </label>
        <input
          id="bx-login-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoFocus
          required
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (status.kind === 'error') setStatus({ kind: 'idle' });
          }}
          placeholder="tu@empresa.cat"
          className="w-full rounded-sm border border-line-2 bg-bg-2 px-3 py-2 text-[13px] text-ink-0 placeholder:text-ink-3 focus:border-cyan-dim focus:outline-none focus:ring-1 focus:ring-cyan-dim"
        />
      </div>

      {status.kind === 'error' && (
        <div className="flex items-start gap-2">
          <Badge variant="ghost-red">Error</Badge>
          <p className="text-[12px] leading-[1.5] text-red">{status.message}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={status.kind === 'sending'}
        className="w-full border border-cyan bg-cyan/15 px-3 py-2.5 font-mono text-[11px] uppercase tracking-[0.18em] text-cyan hover:bg-cyan/25 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {status.kind === 'sending' ? 'Enviant…' : "Envia l'enllaç màgic"}
      </button>

      <p className="pt-2 text-[11px] leading-[1.55] text-ink-3">
        Login amb enllaç màgic. Sense contrasenya. La primera vegada que
        entris, et donarem accés a la teva tenant per defecte.
      </p>
    </form>
  );
}
