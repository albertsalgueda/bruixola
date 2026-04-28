import Link from 'next/link';
import type { Route } from 'next';
import { TopBar } from '@/components/chrome/top-bar';

type Props = {
  title: string;
  /** Short Catalan paragraph displayed beneath the title. */
  body: string;
  /** Defaults to "Tornar a la vista global". Visible CTA back to /cop. */
  ctaLabel?: string;
};

// Stub page rendered in place of features that require authentication.
// Brand-consistent Palantir register: cool-dark, cyan, sans-only, mono caps
// for accents. Used for /login and the auth-gated routes (/properties,
// /deals, /opportunities) until Supabase Auth lands.
export function AuthPlaceholder({
  title,
  body,
  ctaLabel = 'Tornar a la vista global →',
}: Props) {
  return (
    <div className="flex min-h-screen flex-col bg-bg-0 text-ink-1">
      <TopBar />

      <main className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-[480px] border border-line-1 bg-bg-1 px-7 py-9">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-cyan">
            Brúixola · zona privada
          </div>
          <h1 className="mt-3 font-display text-[26px] font-medium leading-tight tracking-tight text-ink-0">
            {title}
          </h1>
          <p className="mt-4 text-[13px] leading-[1.55] text-ink-2">{body}</p>

          <div className="mt-6 flex items-center gap-3">
            <Link
              href={'/cop' as Route}
              className="inline-flex items-center border border-cyan bg-cyan/15 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.16em] text-cyan hover:bg-cyan/25"
            >
              {ctaLabel}
            </Link>
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">
              Supabase Auth · pendent
            </span>
          </div>
        </div>
      </main>
    </div>
  );
}
