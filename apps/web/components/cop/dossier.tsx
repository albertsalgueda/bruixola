import type { City, Listing } from '@/lib/supabase/types';
import { Badge } from '@/components/primitives/badge';

type Props = {
  listings: Listing[];
  city: City | null;
  totalLive: number;
};

// Dossier — left 320px panel.
// Pure server-rendered. Frames the situation in Catalan with severity badges,
// key/value mono rows, and four expandable details sections. No interactivity
// beyond the native <details> toggles.
export function Dossier({ listings, city }: Props) {
  const inZonaCount = listings.filter((l) => l.in_zona_tensionada === true).length;

  // Median P50 yield across listings that have one.
  const yieldValues = listings
    .map((l) => l.gross_yield_pct_p50)
    .filter((v): v is number => typeof v === 'number');
  yieldValues.sort((a, b) => a - b);
  const medianP50 =
    yieldValues.length > 0
      ? yieldValues[Math.floor(yieldValues.length / 2)] ?? null
      : null;

  // Platforms breakdown.
  const platforms = listings.reduce<Record<string, number>>((acc, l) => {
    const k = l.platform ?? 'unknown';
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
  const platformBits = Object.entries(platforms)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${v} ${k}`)
    .join(' · ');

  const cityName = city?.name ?? 'Catalunya';
  const createdAt = new Date().toISOString().slice(0, 16).replace('T', ' ');

  return (
    <div className="scrollbar-thin flex h-full flex-col overflow-y-auto">
      {/* Brand mark */}
      <div className="flex items-start justify-between border-b border-line-1 px-5 pt-5 pb-4">
        <div>
          <div className="font-display text-[26px] font-medium leading-none tracking-tight text-ink-0">
            Brúixola
          </div>
          <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">
            Real-Estate Intelligence
          </div>
        </div>
        <div className="text-right font-mono text-[10px] leading-tight text-ink-3">
          <div>N · 41.39°</div>
          <div>E · 2.16°</div>
        </div>
      </div>

      {/* Section tabs (visual only) */}
      <div className="flex border-b border-line-1 px-5 text-[11px]">
        <div className="-mb-px border-b-2 border-cyan py-2 pr-4 font-mono uppercase tracking-[0.16em] text-ink-0">
          Situacions
        </div>
        <div className="py-2 pr-4 font-mono uppercase tracking-[0.16em] text-ink-3">
          Ops
        </div>
        <div className="py-2 font-mono uppercase tracking-[0.16em] text-ink-3">
          Dades
        </div>
      </div>

      {/* Dossier title + severity */}
      <div className="border-b border-line-1 px-5 py-4">
        <div className="font-display text-[17px] font-medium leading-tight text-ink-0">
          {cityName} · vista global
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge variant="critical">CRÍTIC</Badge>
          <Badge variant="ghost-amber">{inZonaCount} en zona tensionada</Badge>
        </div>
      </div>

      {/* Key/value rows */}
      <div className="border-b border-line-1 px-5 py-4">
        <KvRow k="Creat" v={createdAt} />
        <KvRow k="Severitat" v="Alta" tone="amber" />
        <KvRow
          k="Rang"
          v={`${listings.length} pisos · ${city?.comarca_slug ?? '—'}`}
        />
      </div>

      {/* Expandable sections */}
      <Section title="Detalls" defaultOpen>
        <p className="text-[12px] leading-[1.55] text-ink-1">
          {listings.length} pisos · mediana yield{' '}
          <span className="font-mono text-cyan">
            {medianP50 != null ? medianP50.toFixed(1) : '—'}%
          </span>{' '}
          ·{' '}
          <span className="font-mono text-amber">
            {inZonaCount} en zona tensionada
          </span>
          {platformBits ? (
            <>
              {' '}
              ·{' '}
              <span className="font-mono text-ink-2">{platformBits}</span>
            </>
          ) : null}
          .
        </p>
      </Section>

      <Section title="Intel·ligència">
        <p className="text-[12px] leading-[1.55] text-ink-2">
          Senyals creuats des de SERPAVI, registre HUT de la Generalitat, i
          índexs ETE locals. Verificació pendent en {Math.max(0, listings.length - inZonaCount)} fitxes.
        </p>
      </Section>

      <Section title="Activitat possible">
        <ul className="space-y-1.5 text-[12px] leading-[1.55] text-ink-2">
          <li>· Triangulació de preus contra portals competidors</li>
          <li>· Monitorització d&apos;okupació al voltant de {cityName}</li>
          <li>· Revisió de llicències HUT actives a la comarca</li>
        </ul>
      </Section>

      <Section title="Plans de resposta" defaultOpen>
        <div className="space-y-2">
          <PlanCard
            tone="warn"
            title="Programar visita"
            body="Coordinar visita amb l'agència propietària del pis seleccionat."
          />
          <PlanCard
            tone="crit"
            title={`Trucar a ${listings[0]?.platform ?? 'agència'}`}
            body="Confirmar disponibilitat i tarifa real abans d'avançar dossier."
          />
          <PlanCard
            tone="info"
            title="Comparar amb pisos similars"
            body="Triangulació entre 3 pisos comparables a la mateixa comarca."
          />
        </div>
      </Section>

      <div className="flex-1" />
    </div>
  );
}

function KvRow({ k, v, tone }: { k: string; v: string; tone?: 'amber' | 'cyan' }) {
  const valueClass =
    tone === 'amber'
      ? 'text-amber'
      : tone === 'cyan'
        ? 'text-cyan'
        : 'text-ink-1';
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 font-mono text-[11px]">
      <span className="uppercase tracking-[0.14em] text-ink-3">{k}</span>
      <span className={valueClass}>{v}</span>
    </div>
  );
}

function Section({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details
      open={defaultOpen}
      className="group border-b border-line-1 px-5 py-3 [&_summary::-webkit-details-marker]:hidden"
    >
      <summary className="flex cursor-pointer items-center justify-between font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3 hover:text-ink-1">
        <span>{title}</span>
        <span className="text-ink-3 transition-transform group-open:rotate-90">
          ›
        </span>
      </summary>
      <div className="pt-3">{children}</div>
    </details>
  );
}

function PlanCard({
  tone,
  title,
  body,
}: {
  tone: 'warn' | 'crit' | 'info';
  title: string;
  body: string;
}) {
  const stripeClass =
    tone === 'crit'
      ? 'before:bg-red'
      : tone === 'warn'
        ? 'before:bg-amber'
        : 'before:bg-cyan';
  return (
    <div
      className={`relative bg-bg-2 px-3 py-2.5 pl-4 before:absolute before:left-0 before:top-0 before:h-full before:w-[2px] before:content-[''] ${stripeClass}`}
    >
      <div className="text-[12px] font-medium text-ink-0">{title}</div>
      <div className="mt-1 text-[11px] leading-[1.5] text-ink-2">{body}</div>
    </div>
  );
}
