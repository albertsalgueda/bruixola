'use client';

import { useId, useMemo, useState } from 'react';

/**
 * City picker for forms that need a slug from the 178-row `cities` table.
 *
 * A plain `<select>` with 178 options is unusable. A datalist gives us a
 * native autocomplete that works keyboard-only, doesn't require a popover
 * library, and resolves the typed display name back to a slug on submit.
 *
 * The form value submitted is the slug (the input is hidden + the visible
 * field carries the human name). We resolve on `change` so the form posts
 * the right value even if the user picks via mouse.
 */
export type CityOption = { slug: string; name: string };

export function CityCombobox({
  cities,
  name = 'city_slug',
  required = false,
  defaultSlug = '',
  placeholder = 'Cerca ciutat o municipi...',
}: {
  cities: CityOption[];
  name?: string;
  required?: boolean;
  defaultSlug?: string;
  placeholder?: string;
}) {
  const listId = useId();
  const initial = useMemo(
    () => cities.find((c) => c.slug === defaultSlug)?.name ?? '',
    [cities, defaultSlug],
  );
  const [display, setDisplay] = useState(initial);
  const [slug, setSlug] = useState(defaultSlug);

  return (
    <>
      <input
        type="text"
        list={listId}
        autoComplete="off"
        spellCheck={false}
        value={display}
        placeholder={placeholder}
        required={required}
        onChange={(e) => {
          const v = e.target.value;
          setDisplay(v);
          const match = cities.find((c) => c.name === v);
          setSlug(match?.slug ?? '');
        }}
        className="w-full rounded-sm border border-line-2 bg-bg-2 px-2 py-1.5 text-[12px] text-ink-1 placeholder:text-ink-3 focus:border-cyan-dim focus:outline-none"
      />
      <datalist id={listId}>
        {cities.map((c) => (
          <option key={c.slug} value={c.name} />
        ))}
      </datalist>
      {/* Hidden field is what the server action receives. */}
      <input type="hidden" name={name} value={slug} />
    </>
  );
}
