import Link from 'next/link';
import type { Route } from 'next';
import { TopBar } from '@/components/chrome/top-bar';
import { requireSession } from '@/lib/auth/tenant';
import { SetPasswordForm } from '@/components/settings/set-password-form';

/**
 * `/settings/password` — set or change the account password while
 * authenticated. Useful for users who signed up via magic link and now
 * want to log in faster with email + password.
 *
 * Server component: `requireSession` redirects anonymous visitors to
 * `/login?next=/settings/password` so the gate is enforced before render.
 */
export default async function SetPasswordPage() {
  const user = await requireSession('/settings/password');

  return (
    <div className="flex min-h-screen flex-col bg-bg-0 text-ink-1">
      <TopBar />

      <main className="mx-auto w-full max-w-[520px] flex-1 px-6 py-10">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-cyan">
          Ajustos · Contrasenya
        </div>
        <h1 className="mt-3 font-display text-[26px] font-medium leading-tight tracking-tight text-ink-0">
          Contrasenya
        </h1>
        <p className="mt-2 text-[13px] leading-[1.55] text-ink-2">
          Posa o canvia la contrasenya per al compte{' '}
          <span className="font-mono text-cyan">{user.email}</span>. Després
          podràs entrar amb email + contrasenya en lloc de l&apos;enllaç màgic.
        </p>

        <section className="mt-8 border border-line-1 bg-bg-1 p-6">
          <SetPasswordForm />
        </section>

        <div className="mt-6">
          <Link
            href={'/settings' as Route}
            className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3 hover:text-cyan"
          >
            ← Tornar a Ajustos
          </Link>
        </div>
      </main>
    </div>
  );
}
