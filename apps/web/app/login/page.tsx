import Link from 'next/link';
import type { Route } from 'next';
import { TopBar } from '@/components/chrome/top-bar';
import { MagicLinkForm } from '@/components/auth/magic-link-form';
import { Badge } from '@/components/primitives/badge';

type SearchParams = { next?: string; error?: string };

const SAFE_NEXT_RE = /^\/[a-zA-Z0-9/_\-?=&%.]*$/;

function safeNext(raw: string | undefined): string {
  if (!raw) return '/properties';
  if (!SAFE_NEXT_RE.test(raw)) return '/properties';
  // Block protocol-relative redirects like //evil.com.
  if (raw.startsWith('//')) return '/properties';
  return raw;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { next: rawNext, error } = await searchParams;
  const next = safeNext(rawNext);

  const errorMessage =
    error === 'auth_exchange_failed'
      ? "L'enllaç ha caducat o ja s'ha utilitzat. Torna a sol·licitar-ne un de nou."
      : error === 'no_tenant'
        ? 'No s\'ha trobat cap tenant per al teu compte. Contacta amb l\'administrador.'
        : null;

  return (
    <div className="flex min-h-screen flex-col bg-bg-0 text-ink-1">
      <TopBar />

      <main className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-[440px] border border-line-1 bg-bg-1 px-7 py-9">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-cyan">
            Entrar · Brúixola
          </div>
          <h1 className="mt-3 font-display text-[26px] font-medium leading-tight tracking-tight text-ink-0">
            Entra al teu agent
          </h1>
          <p className="mt-3 text-[12px] leading-[1.55] text-ink-2">
            Brúixola és la teva consola d&apos;intel·ligència immobiliària per
            a Catalunya. Entra per accedir a la teva pipeline, deals i agents
            connectats.
          </p>

          {errorMessage && (
            <div className="mt-5 flex items-start gap-2 border border-red-dim bg-red-dim/10 p-3">
              <Badge variant="ghost-red">Error</Badge>
              <p className="text-[12px] leading-[1.5] text-red">
                {errorMessage}
              </p>
            </div>
          )}

          <div className="mt-7">
            <MagicLinkForm next={next} />
          </div>

          <div className="mt-7 border-t border-line-1 pt-5">
            <Link
              href={'/cop' as Route}
              className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3 hover:text-cyan"
            >
              Què és Brúixola? →
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
