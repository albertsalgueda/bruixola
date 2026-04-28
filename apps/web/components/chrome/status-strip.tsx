import { formatNumber } from '@/lib/format';

/**
 * Thin status strip mounted above the top bar. Mono caps green text,
 * 16px tall, dashes flanking the message — sets the "operations console"
 * tone before the user even reads the words.
 */
export function StatusStrip({ count }: { count: number }) {
  return (
    <div
      className="flex h-4 items-center justify-center border-b border-line-1 bg-bg-0"
      role="status"
      aria-live="polite"
    >
      <span
        className="flex items-center gap-3 font-mono text-[9.5px] uppercase tracking-[0.18em] text-green"
        style={{
          // Inline so the leading/trailing dashes don't depend on Tailwind
          // arbitrary-content utilities, which keeps this purely declarative.
        }}
      >
        <Dash />
        <span>
          DADES PÚBLIQUES {' // '} CATALUNYA · {formatNumber(count)} LISTINGS
          ACTIUS
        </span>
        <Dash />
      </span>
    </div>
  );
}

function Dash() {
  return (
    <span
      aria-hidden
      className="inline-block h-px w-6 bg-green-dim"
    />
  );
}
