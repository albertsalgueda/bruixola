'use client';

import { useEffect, useState } from 'react';
import clsx from 'clsx';

type Props = {
  listingId: string;
  /** Used as the document title before printing so the saved PDF gets a sane filename. */
  pdfTitle?: string;
};

const STORAGE_KEY = 'bruixola.watchlist';

function readWatchlist(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

function writeWatchlist(ids: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // localStorage can throw in private mode — silently fail.
  }
}

/**
 * Header actions on the dossier page.
 *
 * - Watchlist: localStorage-backed (poor-man's persistence; real cross-device
 *   watchlist is Wave 5). Filled star indicates "in list."
 * - Share: copies the current URL to clipboard, flashes "Copiat ✓" for 2s.
 * - PDF: triggers `window.print()`. globals.css adds @media print rules that
 *   hide the chrome and recolour the surface for paper.
 * - Pipeline add: honestly disabled — pipeline is read-only in v1. Tooltip
 *   explains; cursor-not-allowed prevents the dead click.
 */
export function ListingActions({ listingId, pdfTitle }: Props) {
  const [inWatchlist, setInWatchlist] = useState(false);
  const [shareState, setShareState] = useState<'idle' | 'copied' | 'error'>(
    'idle',
  );
  const [printState, setPrintState] = useState<'idle' | 'printing'>('idle');

  useEffect(() => {
    setInWatchlist(readWatchlist().includes(listingId));
  }, [listingId]);

  function toggleWatchlist() {
    const list = readWatchlist();
    const has = list.includes(listingId);
    const next = has
      ? list.filter((id) => id !== listingId)
      : [...list, listingId];
    writeWatchlist(next);
    setInWatchlist(!has);
  }

  async function copyShareLink() {
    if (typeof window === 'undefined') return;
    const href = window.location.href;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(href);
      } else {
        // Fallback — execCommand for legacy browsers / non-https hosts.
        const ta = document.createElement('textarea');
        ta.value = href;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setShareState('copied');
    } catch {
      setShareState('error');
    }
    setTimeout(() => setShareState('idle'), 2000);
  }

  function printPdf() {
    if (typeof window === 'undefined') return;
    // Override the document title so the OS print-to-PDF dialog suggests a
    // human filename instead of the route id. Restore on the next tick —
    // some browsers read the title only at print() entry but Safari reads
    // it asynchronously, so we wait for `afterprint` to swap back.
    const previousTitle = document.title;
    if (pdfTitle) {
      document.title = `Brúixola · ${pdfTitle}`;
    }
    setPrintState('printing');
    const restore = () => {
      document.title = previousTitle;
      setPrintState('idle');
      window.removeEventListener('afterprint', restore);
    };
    window.addEventListener('afterprint', restore);
    window.print();
    // Fallback in case `afterprint` never fires (older browsers).
    setTimeout(restore, 4000);
  }

  return (
    <div className="b-no-print flex shrink-0 items-center gap-2">
      <button
        type="button"
        onClick={toggleWatchlist}
        title={inWatchlist ? 'Treure dels preferits' : 'Afegir als preferits'}
        aria-pressed={inWatchlist}
        aria-label={inWatchlist ? 'Treure dels preferits' : 'Afegir als preferits'}
        className={clsx(
          'flex h-9 w-9 items-center justify-center rounded-sm border bg-bg-2 transition-colors',
          inWatchlist
            ? 'border-amber/60 text-amber hover:border-amber'
            : 'border-line-2 text-ink-2 hover:border-line-3 hover:text-ink-0',
        )}
      >
        {inWatchlist ? '★' : '☆'}
      </button>

      <div className="relative">
        <button
          type="button"
          onClick={copyShareLink}
          title="Copia enllaç al porta-retalls"
          aria-label="Compartir"
          className="flex h-9 w-9 items-center justify-center rounded-sm border border-line-2 bg-bg-2 text-ink-2 hover:border-line-3 hover:text-ink-0"
        >
          ⇲
        </button>
        {shareState !== 'idle' && (
          <span
            className={clsx(
              'pointer-events-none absolute right-0 top-full z-10 mt-1 whitespace-nowrap rounded-sm border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em]',
              shareState === 'copied'
                ? 'border-green-dim bg-bg-2 text-green'
                : 'border-red-dim bg-bg-2 text-red',
            )}
            role="status"
          >
            {shareState === 'copied' ? 'Copiat ✓' : 'Error'}
          </span>
        )}
      </div>

      <div className="relative">
        <button
          type="button"
          onClick={printPdf}
          title="Imprimir o desar com a PDF"
          aria-label="Descarregar PDF"
          className="flex h-9 w-9 items-center justify-center rounded-sm border border-line-2 bg-bg-2 text-ink-2 hover:border-line-3 hover:text-ink-0"
        >
          ↧
        </button>
        {printState === 'printing' && (
          <span
            className="pointer-events-none absolute right-0 top-full z-10 mt-1 whitespace-nowrap rounded-sm border border-cyan-dim bg-bg-2 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-cyan"
            role="status"
          >
            Imprimint…
          </span>
        )}
      </div>

      <button
        type="button"
        disabled
        title="El pipeline es persistirà a la propera versió"
        aria-disabled="true"
        aria-label="Afegir al pipeline (properament)"
        className="flex h-9 cursor-not-allowed items-center gap-2 rounded-sm border border-cyan-dim bg-cyan-dim/20 px-4 font-mono text-[12px] font-medium uppercase tracking-[0.12em] text-cyan/70 opacity-60"
      >
        + afegir al pipeline
      </button>
    </div>
  );
}
