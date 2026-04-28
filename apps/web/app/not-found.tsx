import Link from 'next/link';
import { TopBar } from '@/components/chrome/top-bar';
import {
  getActiveListingsCount,
  getActivityCount24h,
} from '@/lib/activity';

/**
 * Branded 404 — replaces the default Next.js white-page 404.
 *
 * Server component. Mirrors the chrome (`TopBar`) of every other route
 * so the user lands in the same operations console even when they hit a
 * missing resource. Catalan copy throughout.
 */
export default async function NotFound() {
  // Defensive: NotFound runs in surprising contexts (incl. without the full
  // RSC tree). If Supabase is unreachable, fall back to zeros rather than
  // crashing the error page.
  let activeListingsCount = 0;
  let activityCount = 0;
  try {
    [activeListingsCount, activityCount] = await Promise.all([
      getActiveListingsCount(),
      getActivityCount24h(),
    ]);
  } catch {
    // swallow — see comment above
  }

  return (
    <div className="flex min-h-screen flex-col bg-bg-0 text-ink-1">
      <TopBar activityCount={activityCount} />

      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <section className="w-full max-w-[480px] rounded-sm border border-line-1 bg-bg-1 p-8 text-center">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">
            ERROR · 404
          </div>
          <h1 className="mt-3 font-display text-[28px] font-medium leading-tight tracking-tight text-ink-0">
            Pàgina no trobada
          </h1>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-2">
            Aquesta pàgina no existeix o ha estat eliminada.
          </p>

          <div className="mt-6 flex justify-center">
            <Link
              href="/cop"
              className="inline-flex items-center gap-2 rounded-sm border border-cyan-dim bg-cyan-dim/15 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.16em] text-cyan transition-colors hover:bg-cyan-dim/30"
            >
              Tornar a la vista global →
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
