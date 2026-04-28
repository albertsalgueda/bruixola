import type { Listing } from '@/lib/supabase/types';

type Props = {
  listings: Listing[];
};

const DAYS = 13;
const NOW_INDEX = 4;

// Timeline — bottom 168px strip.
// Pure-CSS visualization. Wave 5 will swap in real event data; for now we
// render a representative band with a "Ara" marker, two example event-bars,
// and a numeric axis. No interactivity yet.
export function Timeline({ listings }: Props) {
  const date = new Date();
  const dateLabel = new Intl.DateTimeFormat('ca-ES', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);

  const inZonaCount = listings.filter((l) => l.in_zona_tensionada === true).length;

  const ticks = Array.from({ length: DAYS + 1 }, (_, i) => i);

  return (
    <div className="flex h-full flex-col px-5 py-3">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">
            ARA
          </span>
          <span className="font-mono text-[11px] text-ink-1">{dateLabel}</span>
        </div>
        <div className="flex items-center gap-2 border border-amber/40 bg-amber/10 px-2 py-1">
          <span className="h-1.5 w-1.5 rounded-full bg-amber" />
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-amber">
            Alerta · {inZonaCount} pisos en zona tensionada requereixen revisió
          </span>
        </div>
      </div>

      {/* Track */}
      <div className="relative mt-3 flex-1">
        {/* Baseline */}
        <div className="absolute left-0 right-0 top-1/2 h-px bg-line-2" />

        {/* Tick marks */}
        {ticks.map((i) => {
          const left = `${(i / DAYS) * 100}%`;
          return (
            <div
              key={i}
              className="absolute top-1/2 h-2 w-px -translate-y-1/2 bg-line-2"
              style={{ left }}
            />
          );
        })}

        {/* Event bar — gray "Carregar fitxa" 0..NOW_INDEX */}
        <EventBar
          fromIdx={0}
          toIdx={NOW_INDEX}
          tone="gray"
          label="Carregar fitxa"
        />

        {/* Event bar — amber "Programar visita 14h →" NOW_INDEX..8 */}
        <EventBar
          fromIdx={NOW_INDEX}
          toIdx={8}
          tone="amber"
          label="Programar visita 14h →"
        />

        {/* Now line */}
        <div
          className="absolute top-0 bottom-0 w-[2px] bg-cyan shadow-[0_0_6px_rgba(95,180,212,0.7)]"
          style={{ left: `${(NOW_INDEX / DAYS) * 100}%` }}
        />
        <div
          className="absolute -top-1 -translate-x-1/2 font-mono text-[9px] uppercase tracking-[0.18em] text-cyan"
          style={{ left: `${(NOW_INDEX / DAYS) * 100}%` }}
        >
          Ara
        </div>
      </div>

      {/* Axis labels */}
      <div className="mt-1 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.16em] text-ink-3">
        <span>0</span>
        <span>DIES</span>
        {ticks
          .filter((i) => i > 0 && i % 2 === 0 && i < DAYS)
          .map((i) => (
            <span key={i}>{i}</span>
          ))}
        <span>{DAYS}</span>
      </div>
    </div>
  );
}

function EventBar({
  fromIdx,
  toIdx,
  tone,
  label,
}: {
  fromIdx: number;
  toIdx: number;
  tone: 'gray' | 'amber';
  label: string;
}) {
  const left = `${(fromIdx / DAYS) * 100}%`;
  const width = `${((toIdx - fromIdx) / DAYS) * 100}%`;

  const cls =
    tone === 'amber'
      ? 'bg-amber/15 border-amber/60 text-amber'
      : 'bg-bg-3 border-line-2 text-ink-2';

  // Stack the two example bars at slightly different vertical offsets so they
  // don't collide.
  const top = tone === 'amber' ? '52%' : '20%';

  return (
    <div
      className={`absolute h-5 border ${cls} flex items-center px-2 font-mono text-[10px] uppercase tracking-[0.14em]`}
      style={{ left, width, top }}
    >
      {label}
    </div>
  );
}
