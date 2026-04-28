import { formatPct } from '@/lib/format';

type Props = {
  p25: number | null;
  p50: number | null;
  p75: number | null;
  legalMax: number | null;
  inZonaTensionada: boolean | null;
};

const DOMAIN_MIN = 0;
const DOMAIN_MAX = 12;

function clampPct(v: number | null): number | null {
  if (v == null) return null;
  if (v < DOMAIN_MIN) return DOMAIN_MIN;
  if (v > DOMAIN_MAX) return DOMAIN_MAX;
  return v;
}

function pctToLeft(v: number): string {
  const ratio = (v - DOMAIN_MIN) / (DOMAIN_MAX - DOMAIN_MIN);
  return `${ratio * 100}%`;
}

// YieldBar — yield-range visualization gated against the SERPAVI ceiling.
// Pure-CSS server component. The track gradient runs red→amber→cyan→green→
// amber→red across the 0..12% domain. P25/P50/P75 ticks ride on top, with the
// legal-max line drawn over the track when inside a zona tensionada.
export function YieldBar({ p25, p50, p75, legalMax, inZonaTensionada }: Props) {
  const cP25 = clampPct(p25);
  const cP50 = clampPct(p50);
  const cP75 = clampPct(p75);
  const cLegal = clampPct(legalMax);

  const showLegal = inZonaTensionada === true && cLegal != null;

  return (
    <div className="px-1 py-2">
      {/* Track */}
      <div className="relative h-[38px] w-full overflow-hidden border border-line-2 bg-bg-3">
        <div
          className="absolute inset-0 opacity-70"
          style={{
            background:
              'linear-gradient(to right, rgba(208,74,61,0.55) 0%, rgba(232,178,92,0.55) 25%, rgba(95,180,212,0.55) 45%, rgba(127,190,110,0.55) 60%, rgba(232,178,92,0.55) 80%, rgba(208,74,61,0.55) 100%)',
          }}
        />

        {/* Gridlines every 2% */}
        {[2, 4, 6, 8, 10].map((g) => (
          <div
            key={g}
            className="absolute top-0 bottom-0 w-px bg-bg-0/40"
            style={{ left: pctToLeft(g) }}
          />
        ))}

        {/* Legal ceiling line */}
        {showLegal && cLegal != null && (
          <>
            <div
              className="absolute top-0 bottom-0 w-[2px] bg-red"
              style={{ left: pctToLeft(cLegal) }}
            />
            <div
              className="absolute -top-[2px] -translate-x-1/2 whitespace-nowrap font-mono text-[9px] uppercase tracking-[0.16em] text-red"
              style={{ left: pctToLeft(cLegal), transform: 'translate(-50%, -100%)' }}
            >
              SOSTRE {cLegal.toFixed(1)}%
            </div>
          </>
        )}

        {/* P25 / P50 / P75 ticks */}
        {cP25 != null && (
          <Tick left={pctToLeft(cP25)} label="P25" tone="ink" />
        )}
        {cP50 != null && (
          <Tick left={pctToLeft(cP50)} label="P50" tone="cyan" glow />
        )}
        {cP75 != null && (
          <Tick left={pctToLeft(cP75)} label="P75" tone="ink" />
        )}
      </div>

      {/* Domain labels */}
      <div className="mt-1 flex justify-between font-mono text-[9px] uppercase tracking-[0.14em] text-ink-3">
        <span>0%</span>
        <span>4%</span>
        <span>8%</span>
        <span>12%</span>
      </div>

      {/* Percentile readout */}
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <PctReadout label="P25" value={p25} tone="ink" />
        <PctReadout label="P50" value={p50} tone="cyan" />
        <PctReadout label="P75" value={p75} tone="ink" />
      </div>

      {/* Caption */}
      <div className="mt-3 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3">
        {showLegal && cLegal != null
          ? `Sostre legal SERPAVI: ${cLegal.toFixed(1)}%`
          : 'No aplica sostre legal · pis fora de zona tensionada'}
      </div>
    </div>
  );
}

function Tick({
  left,
  label,
  tone,
  glow = false,
}: {
  left: string;
  label: string;
  tone: 'cyan' | 'ink';
  glow?: boolean;
}) {
  const lineClass = tone === 'cyan' ? 'bg-cyan' : 'bg-ink-1';
  const labelClass = tone === 'cyan' ? 'text-cyan' : 'text-ink-2';
  const shadow = glow
    ? 'shadow-[0_0_8px_rgba(95,180,212,0.7)]'
    : '';
  return (
    <>
      <div
        className={`absolute top-1 bottom-1 w-[2px] ${lineClass} ${shadow}`}
        style={{ left, transform: 'translateX(-50%)' }}
      />
      <div
        className={`absolute bottom-[1px] -translate-x-1/2 font-mono text-[8px] uppercase tracking-[0.16em] ${labelClass}`}
        style={{ left }}
      >
        {label}
      </div>
    </>
  );
}

function PctReadout({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | null;
  tone: 'cyan' | 'ink';
}) {
  const valueClass = tone === 'cyan' ? 'text-cyan' : 'text-ink-1';
  return (
    <div>
      <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-ink-3">
        {label}
      </div>
      <div className={`font-mono text-[13px] ${valueClass}`}>
        {value != null ? formatPct(value) : '—'}
      </div>
    </div>
  );
}
