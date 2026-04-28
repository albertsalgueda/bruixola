'use client';

import { useMemo, useState } from 'react';
import type { City, Listing } from '@/lib/supabase/types';
import { TopBar } from '@/components/chrome/top-bar';
import { StatusStrip } from '@/components/chrome/status-strip';
import { Dossier } from '@/components/cop/dossier';
import { MapView } from '@/components/cop/map';
import { CardStack } from '@/components/cop/card-stack';
import { Timeline } from '@/components/cop/timeline';

type Props = {
  listings: Listing[];
  cities: City[];
  totalLive: number;
};

// Cockpit — top-level COP client component.
// Owns the selected-listing state shared between the map, the right card
// stack, and the floating callout. Server data flows in; selection flows out.
export function Cockpit({ listings, cities, totalLive }: Props) {
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
      <StatusStrip count={totalLive} />
      <TopBar />

      <main className="flex flex-1 min-h-0 flex-col">
        <div className="flex flex-1 min-h-0 border-t border-line-1">
          {/* Left: dossier panel — fixed 320px, server component */}
          <div className="flex w-[320px] shrink-0 flex-col border-r border-line-1 bg-bg-1">
            <Dossier
              listings={listings}
              city={selectedCity}
              totalLive={totalLive}
            />
          </div>

          {/* Center: map */}
          <div className="relative flex flex-1 min-w-0 flex-col bg-bg-0">
            <MapView
              listings={listings}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          </div>

          {/* Right: card stack — fixed 380px */}
          <div className="flex w-[380px] shrink-0 flex-col border-l border-line-1 bg-bg-1">
            <CardStack listing={selectedListing} />
          </div>
        </div>

        {/* Bottom: timeline — fixed 168px */}
        <div className="h-[168px] shrink-0 border-t border-line-1 bg-bg-1">
          <Timeline listings={listings} />
        </div>
      </main>
    </div>
  );
}
