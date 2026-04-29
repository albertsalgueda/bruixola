'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { TopBar } from '@/components/chrome/top-bar';
import { Dossier } from '@/components/cop/dossier';
import { ListingMiniature } from '@/components/cop/listing-miniature';
import { MapView, type ChoroplethMetric } from '@/components/cop/map';
import { MarketPanel } from '@/components/cop/market-panel';
import type {
  CityForMap,
  ComarcaGeo,
  GlobalSummary,
  ListingMarker,
  MapMode,
  PricePoint,
  SelectedScope,
} from '@/lib/market';

type Props = {
  cities: CityForMap[];
  comarques: ComarcaGeo[];
  listings: ListingMarker[];
  priceHistoryByCity: Record<string, PricePoint[]>;
  latestByCity: Record<string, PricePoint>;
  summary: GlobalSummary;
  activityCount?: number;
  /** Initial map mode driven by ?map=zones|anuncis (server). */
  initialMapMode: MapMode;
  /** Whether the visitor has an active session (drives the ★ Seguir button). */
  loggedIn: boolean;
};

type MobilePanel = 'map' | 'dossier' | 'detail';

export function Cockpit({
  cities,
  comarques,
  listings,
  priceHistoryByCity,
  latestByCity,
  summary,
  activityCount = 0,
  initialMapMode,
  loggedIn,
}: Props) {
  const [selectedScope, setSelectedScope] = useState<SelectedScope>({
    kind: null,
    id: null,
  });
  const [mapMode, setMapMode] = useState<MapMode>(initialMapMode);
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>('map');
  const [metric, setMetric] = useState<ChoroplethMetric>('sale');

  const handleSelect = useCallback(
    (s: SelectedScope) => {
      setSelectedScope(s);
      // On mobile, surface the right panel automatically when a selection happens.
      if (s.kind != null) {
        if (typeof window !== 'undefined' && window.innerWidth < 1024) {
          setMobilePanel('detail');
        }
      }
    },
    [],
  );

  // Switching mode clears any selection that doesn't match the new mode.
  useEffect(() => {
    if (
      selectedScope.kind === 'listing' &&
      mapMode === 'zones'
    ) {
      setSelectedScope({ kind: null, id: null });
    }
  }, [mapMode, selectedScope]);

  // Sync ?map= with the current mode, no scroll, replace state (no history bloat).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const u = new URL(window.location.href);
    if (mapMode === 'zones') u.searchParams.delete('map');
    else u.searchParams.set('map', mapMode);
    window.history.replaceState({}, '', u.toString());
  }, [mapMode]);

  const selectedCity = useMemo(
    () =>
      selectedScope.kind === 'city'
        ? cities.find((c) => c.slug === selectedScope.id) ?? null
        : null,
    [cities, selectedScope],
  );
  const selectedComarca = useMemo(
    () =>
      selectedScope.kind === 'comarca'
        ? comarques.find((c) => c.slug === selectedScope.id) ?? null
        : null,
    [comarques, selectedScope],
  );
  const selectedListing = useMemo(
    () =>
      selectedScope.kind === 'listing'
        ? listings.find((l) => l.id === selectedScope.id) ?? null
        : null,
    [listings, selectedScope],
  );

  const closeListing = useCallback(() => {
    setSelectedScope({ kind: null, id: null });
  }, []);

  return (
    <div className="flex h-[100svh] w-full flex-col overflow-hidden bg-bg-0 text-ink-1">
      <TopBar activityCount={activityCount} />

      <main className="flex flex-1 min-h-0 flex-col">
        <h1 className="sr-only">Vista global · Brúixola</h1>

        {/* Mobile bottom-nav between the three panels. Desktop hides it. */}
        <MobileTabBar current={mobilePanel} onChange={setMobilePanel} />

        <div className="flex flex-1 min-h-0 border-t border-line-1">
          {/* LEFT: dossier — desktop sticky 320px; mobile only when active */}
          <aside
            aria-label="Dossier de la situació"
            className={
              'w-full shrink-0 flex-col border-r border-line-1 bg-bg-1 lg:flex lg:w-[320px] ' +
              (mobilePanel === 'dossier' ? 'flex' : 'hidden')
            }
          >
            <Dossier
              cities={cities}
              comarques={comarques}
              latestByCity={latestByCity}
              summary={summary}
              selectedCity={selectedCity}
              selectedComarca={selectedComarca}
              metric={metric}
              onMetricChange={setMetric}
            />
          </aside>

          {/* CENTER: map */}
          <section
            aria-label="Mapa de Catalunya"
            className={
              'relative flex-1 min-h-0 min-w-0 flex-col bg-bg-0 lg:flex ' +
              (mobilePanel === 'map' ? 'flex' : 'hidden')
            }
          >
            <MapView
              cities={cities}
              comarques={comarques}
              listings={listings}
              latestByCity={latestByCity}
              selectedScope={selectedScope}
              onSelect={handleSelect}
              mapMode={mapMode}
              metric={metric}
            />

            {/* Floating mode toggle on the map — top-center, never blocks markers */}
            <div className="pointer-events-auto absolute left-1/2 top-3 z-20 -translate-x-1/2">
              <ModeToggle mode={mapMode} onChange={setMapMode} />
            </div>
          </section>

          {/* RIGHT: detail panel */}
          <aside
            aria-label="Detall del territori seleccionat"
            className={
              'w-full shrink-0 flex-col border-l border-line-1 bg-bg-1 lg:flex lg:w-[380px] ' +
              (mobilePanel === 'detail' ? 'flex' : 'hidden')
            }
          >
            {mapMode === 'listings' && selectedListing ? (
              <ListingMiniature
                listing={selectedListing}
                loggedIn={loggedIn}
                returnTo={
                  typeof window !== 'undefined'
                    ? window.location.pathname + window.location.search
                    : '/cop?map=anuncis'
                }
                onClose={closeListing}
              />
            ) : (
              <MarketPanel
                selectedScope={selectedScope}
                cities={cities}
                comarques={comarques}
                priceHistoryByCity={priceHistoryByCity}
                latestByCity={latestByCity}
              />
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}

/** Floating ZONES · ANUNCIS toggle on the map. */
function ModeToggle({
  mode,
  onChange,
}: {
  mode: MapMode;
  onChange: (m: MapMode) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Mode del mapa"
      className="flex items-stretch border border-line-1 bg-bg-1/95 shadow-sm backdrop-blur-sm"
    >
      <ModeButton
        active={mode === 'zones'}
        onClick={() => onChange('zones')}
        label="Zones"
      />
      <ModeButton
        active={mode === 'listings'}
        onClick={() => onChange('listings')}
        label="Anuncis"
      />
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={
        'min-h-[36px] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] ' +
        (active
          ? 'bg-cyan/15 text-cyan'
          : 'text-ink-3 hover:text-ink-1')
      }
    >
      {label}
    </button>
  );
}

/**
 * Mobile-only bottom tab bar that swaps between the three panels. Sticky at
 * the top under the chrome (touch-friendly without intercepting map gestures
 * at the bottom of the screen).
 */
function MobileTabBar({
  current,
  onChange,
}: {
  current: MobilePanel;
  onChange: (p: MobilePanel) => void;
}) {
  return (
    <nav
      aria-label="Panells"
      className="flex items-stretch border-b border-line-1 bg-bg-1 lg:hidden"
    >
      {(['map', 'dossier', 'detail'] as const).map((p) => (
        <button
          key={p}
          type="button"
          aria-current={current === p ? 'page' : undefined}
          onClick={() => onChange(p)}
          className={
            'flex-1 border-r border-line-1 py-2 font-mono text-[10px] uppercase tracking-[0.18em] last:border-r-0 ' +
            (current === p
              ? 'bg-cyan/15 text-cyan'
              : 'text-ink-3 hover:text-ink-1')
          }
        >
          {p === 'map' ? 'Mapa' : p === 'dossier' ? 'Dossier' : 'Detall'}
        </button>
      ))}
    </nav>
  );
}
