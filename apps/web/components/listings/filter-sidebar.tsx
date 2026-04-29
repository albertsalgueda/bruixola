import Link from 'next/link';
import type { Route } from 'next';
import type { City } from '@/lib/supabase/types';

type Props = {
  cities: Array<Pick<City, 'slug' | 'name'>>;
  // Current values to repopulate inputs.
  q: string | null;
  city: string | null;
  maxPrice: number | null;
  minYield: number | null;
  condition: string | null;
  zonaTensionada: boolean | null;
  strategy: string | null;
  view: string;
};

/**
 * Sticky filter sidebar for /listings. A real <form action="/listings">
 * — submission goes through Next.js as a normal GET, no JavaScript needed.
 *
 * Grouped sections (Ciutat, Preu, Yield, Zona, Estat) match how an
 * investor narrows down a feed. Each section is a label + control,
 * Palantir-style cool-dark cyan accent.
 */
export function FilterSidebar({
  cities,
  q,
  city,
  maxPrice,
  minYield,
  condition,
  zonaTensionada,
  strategy,
  view,
}: Props) {
  const anyActive = Boolean(
    q || city || maxPrice || minYield || condition || zonaTensionada !== null || strategy,
  );
  return (
    <aside
      aria-label="Filtres"
      className="flex h-fit flex-col gap-5 border border-line-1 bg-bg-1 p-5"
    >
      <div className="flex items-center justify-between">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-cyan">
          Filtres
        </div>
        {anyActive && (
          <Link
            href={'/listings' as Route}
            className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3 hover:text-cyan"
          >
            Esborrar
          </Link>
        )}
      </div>

      <form action="/listings" method="get" className="space-y-4">
        {/* preserve view across filter submissions */}
        {view !== 'table' && (
          <input type="hidden" name="view" value={view} />
        )}
        {strategy && <input type="hidden" name="strategy" value={strategy} />}

        <Field label="Cerca">
          <input
            name="q"
            type="search"
            defaultValue={q ?? ''}
            placeholder="adreça, títol…"
            className={inputCls}
          />
        </Field>

        <Field label="Ciutat">
          <select name="city" defaultValue={city ?? ''} className={inputCls}>
            <option value="">Totes</option>
            {cities.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Preu màx (€)">
          <input
            name="max_price_eur"
            type="number"
            min={1}
            step={5000}
            inputMode="numeric"
            defaultValue={maxPrice ?? ''}
            placeholder="250000"
            className={inputCls}
          />
        </Field>

        <Field label="Yield P50 mín (%)">
          <input
            name="min_yield_p50"
            type="number"
            min={0}
            step={0.5}
            inputMode="decimal"
            defaultValue={minYield ?? ''}
            placeholder="6"
            className={inputCls}
          />
        </Field>

        <Field label="Zona">
          <div className="flex gap-1.5">
            <ZonaPill
              value={null}
              current={zonaTensionada}
              label="Totes"
            />
            <ZonaPill
              value={true}
              current={zonaTensionada}
              label="Tensionada"
            />
            <ZonaPill
              value={false}
              current={zonaTensionada}
              label="Lliure"
            />
          </div>
        </Field>

        <Field label="Condició">
          <select
            name="condition"
            defaultValue={condition ?? ''}
            className={inputCls}
          >
            <option value="">Qualsevol</option>
            <option value="reformado">Reformat</option>
            <option value="good">Bon estat</option>
            <option value="reform_needed">Cal reforma</option>
            <option value="wreck">Per enderrocar</option>
            <option value="unknown">Sense verificar</option>
          </select>
        </Field>

        <button
          type="submit"
          className="w-full border border-cyan bg-cyan/15 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-cyan hover:bg-cyan/25"
        >
          Aplicar filtres
        </button>
      </form>
    </aside>
  );
}

const inputCls =
  'w-full rounded-sm border border-line-2 bg-bg-2 px-2 py-1.5 text-[12px] text-ink-1 placeholder:text-ink-3 focus:border-cyan-dim focus:outline-none';

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3">
        {label}
      </span>
      {children}
    </label>
  );
}

/**
 * The zona-tensionada filter is tri-state (null / true / false) so we use
 * a radio-group disguised as pills. Each pill submits via a hidden input
 * carried inside the parent form (same name attribute, the selected one
 * is rendered as a checked radio).
 */
function ZonaPill({
  value,
  current,
  label,
}: {
  value: boolean | null;
  current: boolean | null;
  label: string;
}) {
  const active = current === value;
  const radioValue = value === null ? '' : value ? 'true' : 'false';
  const id = `zt-${value === null ? 'all' : value ? 'yes' : 'no'}`;
  return (
    <label
      htmlFor={id}
      className={
        'flex-1 cursor-pointer border px-2 py-1.5 text-center font-mono text-[10px] uppercase tracking-[0.14em] transition-colors ' +
        (active
          ? 'border-cyan bg-cyan/15 text-cyan'
          : 'border-line-2 bg-bg-2 text-ink-3 hover:text-ink-1')
      }
    >
      <input
        id={id}
        type="radio"
        name="in_zona_tensionada"
        value={radioValue}
        defaultChecked={active}
        className="sr-only"
      />
      {label}
    </label>
  );
}
