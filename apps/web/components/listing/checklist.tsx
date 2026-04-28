'use client';

import { useEffect, useState } from 'react';
import clsx from 'clsx';

type Props = {
  listingId: string;
  items: readonly string[];
};

const KEY_PREFIX = 'bruixola.unverified';

function readState(listingId: string, item: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return (
      window.localStorage.getItem(`${KEY_PREFIX}.${listingId}.${item}`) ===
      'true'
    );
  } catch {
    return false;
  }
}

function writeState(listingId: string, item: string, checked: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    const k = `${KEY_PREFIX}.${listingId}.${item}`;
    if (checked) window.localStorage.setItem(k, 'true');
    else window.localStorage.removeItem(k);
  } catch {
    // ignore
  }
}

/**
 * Client-side checklist with per-item localStorage persistence.
 *
 * Each entry is keyed `bruixola.unverified.{listingId}.{item}`. State hydrates
 * after mount (so SSR markup is identical for all users). Checking a box also
 * crosses out the label — small but useful affordance for "I've handled this."
 */
export function UnverifiedChecklist({ listingId, items }: Props) {
  const [checks, setChecks] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const next: Record<string, boolean> = {};
    for (const item of items) next[item] = readState(listingId, item);
    setChecks(next);
  }, [listingId, items]);

  const verifiedCount = Object.values(checks).filter(Boolean).length;

  function toggle(item: string) {
    setChecks((prev) => {
      const nextValue = !prev[item];
      writeState(listingId, item, nextValue);
      return { ...prev, [item]: nextValue };
    });
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-amber">
          No verificat · Llista Brúixola
        </div>
        <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">
          {verifiedCount} / {items.length} verificat
        </div>
      </div>
      <p className="mt-2 max-w-2xl text-[12px] text-ink-2">
        La plataforma de l&apos;agència no ho diu, però sí que importa. Marca cada
        element abans de posar el pis al pipeline. L&apos;estat es desa al teu
        navegador.
      </p>
      <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {items.map((item) => {
          const checked = !!checks[item];
          return (
            <li key={item}>
              <label
                className={clsx(
                  'flex cursor-pointer items-center gap-3 rounded-sm border bg-bg-2 px-3 py-2 transition-colors',
                  checked
                    ? 'border-green-dim/70'
                    : 'border-line-1 hover:border-line-3',
                )}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(item)}
                  className="h-4 w-4 shrink-0 cursor-pointer accent-green"
                  aria-label={item}
                />
                <span
                  className={clsx(
                    'font-mono text-[11px] uppercase tracking-[0.12em]',
                    checked
                      ? 'text-ink-3 line-through decoration-green-dim'
                      : 'text-ink-1',
                  )}
                >
                  {item}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </>
  );
}
