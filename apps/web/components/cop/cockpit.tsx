'use client';

import { useMemo, useState } from 'react';
import type { City, Listing } from '@/lib/supabase/types';
import { TopBar } from '@/components/chrome/top-bar';
import { Dossier } from '@/components/cop/dossier';
import { MapView } from '@/components/cop/map';
import { CardStack } from '@/components/cop/card-stack';
import { ChatPanel } from '@/components/chat/chat-panel';

type Props = {
  listings: Listing[];
  cities: City[];
  totalLive: number;
  activityCount?: number;
};

// Cockpit — top-level COP client component.
// Owns the selected-listing state shared between the map, the right card
// stack, and the floating callout. Server data flows in; selection flows out.
export function Cockpit({ listings, cities, totalLive, activityCount = 0 }: Props) {
  const initialId = listings[0]?.id ?? null;
  const [selectedId, setSelectedId] = useState<string | null>(initialId);

  const selectedListing = useMemo(
    () => listings.find((l) => l.id === selectedId) ?? null,
    [listings, selectedId],
  );

  // Default focus city: the city of the selected listing, falling back to Reus
  // if we cannot resolve it from the dictionary.
  const selectedCity = useMemo<City | null>(() => {
    if (selectedListing) {
      const slug = (selectedListing.city_slug ?? '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      const match =
        cities.find((c) => c.slug === slug) ??
        cities.find(
          (c) => c.name.toLowerCase() === (selectedListing.city_slug ?? '').toLowerCase(),
        );
      if (match) return match;
    }
    return cities.find((c) => c.slug === 'reus') ?? cities[0] ?? null;
  }, [selectedListing, cities]);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-bg-0 text-ink-1">
      <TopBar activityCount={activityCount} />

      <main className="flex flex-1 min-h-0 flex-col">
        <h1 className="sr-only">Vista global · Brúixola</h1>
        <div className="flex flex-1 min-h-0 border-t border-line-1">
          {/* Left: dossier panel — fixed 320px, server component */}
          <aside
            aria-label="Dossier de la situació"
            className="flex w-[320px] shrink-0 flex-col border-r border-line-1 bg-bg-1"
          >
            <Dossier
              listings={listings}
              city={selectedCity}
              totalLive={totalLive}
            />
          </aside>

          {/* Center: map */}
          <section
            aria-label="Mapa de pisos"
            className="relative flex flex-1 min-h-0 min-w-0 flex-col bg-bg-0"
          >
            <MapView
              listings={listings}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          </section>

          {/* Right: card stack — fixed 380px */}
          <aside
            aria-label="Fitxa del pis seleccionat"
            className="flex w-[380px] shrink-0 flex-col border-l border-line-1 bg-bg-1"
          >
            <CardStack listing={selectedListing} />
          </aside>
        </div>
      </main>

      {/* Right-edge collapsible Brúixola Agent chat — overlays the cockpit. */}
      <ChatPanel />
    </div>
  );
}
