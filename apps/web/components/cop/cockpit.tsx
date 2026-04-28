'use client';

import { useCallback, useState } from 'react';
import { TopBar } from '@/components/chrome/top-bar';
import { Dossier } from '@/components/cop/dossier';
import { MapView } from '@/components/cop/map';
import { MarketPanel } from '@/components/cop/market-panel';
// import { ChatPanel } from '@/components/chat/chat-panel'; // Disabled — re-enable with the JSX below.
import type {
  CityForMap,
  ComarcaGeo,
  GlobalSummary,
  PricePoint,
  SelectedScope,
} from '@/lib/market';

type Props = {
  cities: CityForMap[];
  comarques: ComarcaGeo[];
  priceHistoryByCity: Record<string, PricePoint[]>;
  latestByCity: Record<string, PricePoint>;
  summary: GlobalSummary;
  activityCount?: number;
};

// Cockpit — top-level COP client component.
// Owns the selectedScope state shared between the map (centre), the dossier
// (left), and the market panel (right). Server data flows in; selection
// flows out.
export function Cockpit({
  cities,
  comarques,
  priceHistoryByCity,
  latestByCity,
  summary,
  activityCount = 0,
}: Props) {
  const [selectedScope, setSelectedScope] = useState<SelectedScope>({
    kind: null,
    id: null,
  });

  const handleSelect = useCallback((s: SelectedScope) => {
    setSelectedScope(s);
  }, []);

  const selectedCity =
    selectedScope.kind === 'city'
      ? cities.find((c) => c.slug === selectedScope.id) ?? null
      : null;
  const selectedComarca =
    selectedScope.kind === 'comarca'
      ? comarques.find((c) => c.slug === selectedScope.id) ?? null
      : null;

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-bg-0 text-ink-1">
      <TopBar activityCount={activityCount} />

      <main className="flex flex-1 min-h-0 flex-col">
        <h1 className="sr-only">Vista global · Brúixola</h1>
        <div className="flex flex-1 min-h-0 border-t border-line-1">
          {/* Left: dossier panel — fixed 320px */}
          <aside
            aria-label="Dossier de la situació"
            className="flex w-[320px] shrink-0 flex-col border-r border-line-1 bg-bg-1"
          >
            <Dossier
              cities={cities}
              comarques={comarques}
              latestByCity={latestByCity}
              summary={summary}
              selectedCity={selectedCity}
              selectedComarca={selectedComarca}
            />
          </aside>

          {/* Center: map — choropleth + city dots */}
          <section
            aria-label="Mapa de Catalunya"
            className="relative flex flex-1 min-h-0 min-w-0 flex-col bg-bg-0"
          >
            <MapView
              cities={cities}
              comarques={comarques}
              latestByCity={latestByCity}
              selectedScope={selectedScope}
              onSelect={handleSelect}
            />
          </section>

          {/* Right: market panel — fixed 380px, scopes to selection */}
          <aside
            aria-label="Detall del territori seleccionat"
            className="flex w-[380px] shrink-0 flex-col border-l border-line-1 bg-bg-1"
          >
            <MarketPanel
              selectedScope={selectedScope}
              cities={cities}
              comarques={comarques}
              priceHistoryByCity={priceHistoryByCity}
              latestByCity={latestByCity}
            />
          </aside>
        </div>
      </main>

      {/* Right-edge collapsible Brúixola Agent chat — overlays the cockpit. */}
      {/* Disabled — re-enable by uncommenting <ChatPanel /> and the import above. */}
      {/* <ChatPanel /> */}
    </div>
  );
}
