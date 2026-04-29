'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Badge } from '@/components/primitives/badge';

type Mode = 'login' | 'signup';

type Status =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'sent-signup'; email: string }
  | { kind: 'error'; message: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

/**
 * Email + password sign-in / sign-up. Ships three modes:
 *   - login   → `signInWithPassword`, on success navigates to `next`
 *   - signup  → `signUp`. If Supabase email confirmations are off, also
 *               auto-logs in. If on, shows "comprova el correu" state.
 *   - reset   → `resetPasswordForEmail`, sends a recovery link.
 *
 * The session is set client-side, so we use `window.location.href = next`
 * after auth to trigger a full reload — server components must re-render
 * with the new cookie attached.
 */
export function PasswordForm({ next }: { next: string }) {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmedEmail = email.trim();
    if (!EMAIL_RE.test(trimmedEmail)) {
      setStatus({ kind: 'error', message: 'Format de correu invàlid.' });
      return;
    }
    if (password.length < MIN_PASSWORD) {
      setStatus({
        kind: 'error',
        message: `La contrasenya ha de tenir com a mínim ${MIN_PASSWORD} caràcters.`,
      });
      return;
    }

    setStatus({ kind: 'submitting' });
    const supabase = createClient();

    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password,
        });
        if (error) {
          setStatus({ kind: 'error', message: humanizeError(error.message) });
          return;
        }
        // Full reload so the server cookie is honoured.
        window.location.href = next;
        return;
      }

      // mode === 'signup'
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
      const { data, error } = await supabase.auth.signUp({
        email: trimmedEmail,
        password,
        options: { emailRedirectTo: redirectTo },
      });
      if (error) {
        setStatus({ kind: 'error', message: humanizeError(error.message) });
        return;
      }
      // If the project has email confirmations OFF, signUp returns a session
      // and we can navigate immediately. Otherwise the user must click a link.
      if (data.session) {
        window.location.href = next;
        return;
      }
      setStatus({ kind: 'sent-signup', email: trimmedEmail });
    } catch {
      setStatus({
        kind: 'error',
        message: 'Error de xarxa. Comprova la connexió i torna a intentar-ho.',
      });
    }
  }

  if (status.kind === 'sent-signup') {
    return (
      <SuccessPanel
        badge="Confirma el correu"
        title="Compte creat"
        body={
          <>
            Comprova el correu — t&apos;hem enviat un enllaç de confirmació a{' '}
            <span className="font-mono text-cyan">{status.email}</span>. Has
            d&apos;activar el compte abans d&apos;entrar.
          </>
        }
        onBack={() => {
          setStatus({ kind: 'idle' });
          setMode('login');
        }}
      />
    );
  }

  const submitting = status.kind === 'submitting';

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <Field label="Correu" id="bx-pw-email">
        <input
          id="bx-pw-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (status.kind === 'error') setStatus({ kind: 'idle' });
          }}
          placeholder="tu@empresa.cat"
          className={inputCls}
        />
      </Field>

      <Field
        label="Contrasenya"
        id="bx-pw-pass"
        hint={mode === 'signup' ? `Mínim ${MIN_PASSWORD} caràcters` : undefined}
      >
        <input
          id="bx-pw-pass"
          type="password"
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          required
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            if (status.kind === 'error') setStatus({ kind: 'idle' });
          }}
          placeholder="••••••••"
          className={inputCls}
          minLength={MIN_PASSWORD}
        />
      </Field>

      {status.kind === 'error' && (
        <div className="flex items-start gap-2">
          <Badge variant="ghost-red">Error</Badge>
          <p className="text-[12px] leading-[1.5] text-red">{status.message}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full border border-cyan bg-cyan/15 px-3 py-2.5 font-mono text-[11px] uppercase tracking-[0.18em] text-cyan hover:bg-cyan/25 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting
          ? 'Enviant…'
          : mode === 'login'
            ? 'Entrar'
            : 'Crear compte'}
      </button>

      <div className="flex items-center justify-between gap-3 pt-1">
        <button
          type="button"
          onClick={() => {
            setMode(mode === 'login' ? 'signup' : 'login');
            setStatus({ kind: 'idle' });
          }}
          className="font-mono text-[10px] uppercase tracking-[0.18em] text-cyan hover:text-cyan-hot"
        >
          {mode === 'login' ? 'Crear compte →' : '← Ja tens compte? Entra'}
        </button>
      </div>

      {mode === 'login' && (
        <p className="pt-2 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3">
          Has oblidat la contrasenya? Fes servir l&apos;enllaç màgic.
        </p>
      )}
    </form>
  );
}

function SuccessPanel({
  badge,
  title,
  body,
  onBack,
}: {
  badge: string;
  title: string;
  body: React.ReactNode;
  onBack: () => void;
}) {
  return (
    <div className="space-y-5">
      <Badge variant="ghost-cyan">{badge}</Badge>
      <h2 className="font-display text-[18px] font-medium tracking-tight text-ink-0">
        {title}
      </h2>
      <p className="text-[13px] leading-[1.55] text-ink-1">{body}</p>
      <button
        type="button"
        onClick={onBack}
        className="font-mono text-[10px] uppercase tracking-[0.18em] text-cyan hover:text-cyan-hot"
      >
        ← Tornar al formulari
      </button>
    </div>
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

/** Translate the most common Supabase auth errors to Catalan UX-friendly text. */
function humanizeError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('invalid login') || m.includes('invalid_credentials'))
    return 'Correu o contrasenya incorrectes.';
  if (m.includes('user already registered') || m.includes('already_exists'))
    return 'Aquest correu ja té compte. Prova d’entrar.';
  if (m.includes('email not confirmed'))
    return 'El compte encara no està confirmat. Mira el correu.';
  if (m.includes('rate'))
    return 'Massa intents — espera uns minuts abans de tornar-ho a provar.';
  if (m.includes('weak') || m.includes('password'))
    return msg;
  return msg || 'Error inesperat.';
}
