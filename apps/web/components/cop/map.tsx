'use client';

import 'mapbox-gl/dist/mapbox-gl.css';
import mapboxgl from 'mapbox-gl';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Listing } from '@/lib/supabase/types';
import { listingCoords } from '@/lib/coords';
import { Callout } from '@/components/cop/callout';

type Props = {
  listings: Listing[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

const CATALONIA_CENTER: [number, number] = [1.7, 41.65];
const DEFAULT_ZOOM = 7.6;

// Mapbox token — public-key style (pk.*) so it ships safely to the browser.
// We set it once at module load. Without a token the map intentionally renders
// nothing — better than a silent dark void.
if (typeof window !== 'undefined') {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (token) {
    mapboxgl.accessToken = token;
  }
}

// MapView — center column.
// Initialises a Mapbox GL map once on mount, drives it imperatively from props.
// Custom DOM markers carry the bed count and pulse cyan; the selected marker
// goes amber. The floating <Callout/> is positioned in screen pixels by
// reading map.project() on every move.
export function MapView({ listings, selectedId, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const elementsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const onSelectRef = useRef(onSelect);
  const [tokenMissing] = useState(
    () => !process.env.NEXT_PUBLIC_MAPBOX_TOKEN,
  );
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  // Coords lookup for the selected listing — recompute when selection changes.
  const selectedCoords = useMemo<[number, number] | null>(() => {
    const l = listings.find((x) => x.id === selectedId);
    return l ? listingCoords(l) : null;
  }, [listings, selectedId]);

  const [calloutXY, setCalloutXY] = useState<{ x: number; y: number } | null>(
    null,
  );

  // Init map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    if (tokenMissing) return; // surfaced in fallback UI below

    const container = containerRef.current;

    let map: mapboxgl.Map;
    try {
      map = new mapboxgl.Map({
        container,
        style: 'mapbox://styles/mapbox/dark-v11',
        center: CATALONIA_CENTER,
        zoom: DEFAULT_ZOOM,
        attributionControl: false,
      });
    } catch (err) {
      setInitError(
        err instanceof Error ? err.message : 'No s’ha pogut iniciar el mapa',
      );
      return;
    }
    map.scrollZoom.disable();
    map.addControl(new mapboxgl.NavigationControl(), 'top-right');
    map.addControl(
      new mapboxgl.AttributionControl({ compact: true }),
      'bottom-right',
    );
    mapRef.current = map;

    // Belt + suspenders for the classic Flexbox-collapses-the-map-canvas bug:
    //  1. Initial resize on next frame + 120ms + 360ms, in case the box was
    //     0×0 at mount and only stretched after layout settled.
    //  2. ResizeObserver on the parent so any later layout shift (panel
    //     toggles, window resize, dev-tools open) re-syncs the WebGL canvas.
    const kick = () => map.resize();
    requestAnimationFrame(kick);
    const t1 = setTimeout(kick, 120);
    const t2 = setTimeout(kick, 360);
    const t3 = setTimeout(kick, 1000);
    const ro = new ResizeObserver(kick);
    if (container.parentElement) ro.observe(container.parentElement);
    ro.observe(container);
    window.addEventListener('resize', kick);

    return () => {
      window.removeEventListener('resize', kick);
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      markersRef.current.clear();
      elementsRef.current.clear();
    };
  }, [tokenMissing]);

  // Sync markers when listings change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const ensure = () => {
      // Remove markers for listings no longer present.
      const ids = new Set(listings.map((l) => l.id));
      for (const [id, marker] of markersRef.current) {
        if (!ids.has(id)) {
          marker.remove();
          markersRef.current.delete(id);
          elementsRef.current.delete(id);
        }
      }

      // Add or update markers.
      for (const listing of listings) {
        const coords = listingCoords(listing);
        if (!coords) continue;

        let marker = markersRef.current.get(listing.id);
        if (!marker) {
          const el = document.createElement('div');
          el.className = 'b-pin';
          el.dataset.id = listing.id;
          el.textContent = listing.beds != null ? String(listing.beds) : '·';
          el.addEventListener('click', (e) => {
            e.stopPropagation();
            onSelectRef.current(listing.id);
          });

          marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
            .setLngLat(coords)
            .addTo(map);
          markersRef.current.set(listing.id, marker);
          elementsRef.current.set(listing.id, el);
        } else {
          marker.setLngLat(coords);
        }
      }
    };

    if (map.loaded()) {
      ensure();
    } else {
      map.once('load', ensure);
    }
  }, [listings]);

  // Update selection styling on the marker DOM.
  useEffect(() => {
    for (const [id, el] of elementsRef.current) {
      if (id === selectedId) {
        el.classList.add('b-pin--selected');
      } else {
        el.classList.remove('b-pin--selected');
      }
    }
  }, [selectedId]);

  // Fly-to + callout positioning when selection or coords change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!selectedCoords) {
      setCalloutXY(null);
      return;
    }

    map.flyTo({ center: selectedCoords, zoom: Math.max(map.getZoom(), 11), speed: 0.8 });

    const updateXY = () => {
      const p = map.project(selectedCoords);
      setCalloutXY({ x: p.x, y: p.y });
    };

    updateXY();
    map.on('move', updateXY);
    map.on('zoom', updateXY);
    map.on('resize', updateXY);

    return () => {
      map.off('move', updateXY);
      map.off('zoom', updateXY);
      map.off('resize', updateXY);
    };
  }, [selectedCoords]);

  const selectedListing = listings.find((l) => l.id === selectedId) ?? null;

  // Container sizing: we use `position: absolute; inset: 0` on the actual
  // Mapbox container BUT with an inline-style fallback (`width:100%; height:100%`)
  // because Mapbox-gl sets `position: relative` on its container at init,
  // which would otherwise nullify the Tailwind `inset-0` utility. The inline
  // dimensions ensure the WebGL canvas always has a real box to draw into.
  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden">
      <div
        ref={containerRef}
        className="absolute inset-0"
        style={{ width: '100%', height: '100%' }}
      />

      {tokenMissing && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-bg-0/90 px-6 text-center">
          <div className="max-w-md">
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-amber">
              Mapbox token absent
            </div>
            <div className="mt-2 font-display text-[16px] text-ink-0">
              Configura NEXT_PUBLIC_MAPBOX_TOKEN a apps/web/.env.local
            </div>
            <div className="mt-1 text-[12px] text-ink-2">
              El mapa torna en blanc fins que hi hagi un token vàlid.
            </div>
          </div>
        </div>
      )}

      {!tokenMissing && initError && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-bg-0/90 px-6 text-center">
          <div className="max-w-md">
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-amber">
              WebGL no disponible
            </div>
            <div className="mt-2 font-display text-[16px] text-ink-0">
              No s&apos;ha pogut iniciar el mapa
            </div>
            <div className="mt-1 text-[12px] text-ink-2">
              {initError}. Revisa el suport de WebGL al navegador.
            </div>
          </div>
        </div>
      )}

      {/* Custom marker styles co-located here for portability. */}
      <style>{`
        .b-pin {
          width: 22px;
          height: 22px;
          border-radius: 9999px;
          background: var(--color-cyan);
          color: var(--color-bg-0);
          font-family: var(--font-mono);
          font-size: 11px;
          font-weight: 600;
          line-height: 22px;
          text-align: center;
          cursor: pointer;
          border: 1.5px solid rgba(10, 14, 20, 0.85);
          box-shadow:
            0 0 0 0 rgba(95, 180, 212, 0.6),
            0 1px 4px rgba(0, 0, 0, 0.4);
          transition:
            transform 120ms ease-out,
            background-color 120ms ease-out,
            color 120ms ease-out,
            width 120ms ease-out,
            height 120ms ease-out,
            line-height 120ms ease-out;
          animation: bPinPulse 2.4s ease-out infinite;
        }
        .b-pin:hover {
          transform: scale(1.08);
        }
        .b-pin--selected {
          background: var(--color-amber);
          color: var(--color-bg-0);
          width: 28px;
          height: 28px;
          line-height: 28px;
          font-size: 12px;
          z-index: 5;
          animation: bPinPulseSelected 1.6s ease-out infinite;
        }
        @keyframes bPinPulse {
          0% { box-shadow: 0 0 0 0 rgba(95, 180, 212, 0.45); }
          70% { box-shadow: 0 0 0 10px rgba(95, 180, 212, 0); }
          100% { box-shadow: 0 0 0 0 rgba(95, 180, 212, 0); }
        }
        @keyframes bPinPulseSelected {
          0% { box-shadow: 0 0 0 0 rgba(232, 178, 92, 0.55); }
          70% { box-shadow: 0 0 0 14px rgba(232, 178, 92, 0); }
          100% { box-shadow: 0 0 0 0 rgba(232, 178, 92, 0); }
        }
      `}</style>

      {/* Map overlay — coordinate stamp (analytical surface flourish). */}
      <div className="pointer-events-none absolute left-3 top-3 z-10 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">
        Catalunya · OPS
      </div>

      <Callout listing={selectedListing} xy={calloutXY} />
    </div>
  );
}
