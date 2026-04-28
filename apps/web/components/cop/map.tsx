'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import maplibregl from 'maplibre-gl';
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

const STYLE_DARK_MATTER =
  'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

function buildStyleUrl(): string {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (token) {
    return `https://api.mapbox.com/styles/v1/mapbox/dark-v11?access_token=${token}`;
  }
  return STYLE_DARK_MATTER;
}

// MapView — center column.
// Initialises a MapLibre map once on mount, drives it imperatively from props.
// Custom DOM markers carry the bed count and pulse cyan; the selected marker
// goes amber. The floating <Callout/> is positioned in screen pixels by
// reading map.project() on every move.
export function MapView({ listings, selectedId, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const elementsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const onSelectRef = useRef(onSelect);

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

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: buildStyleUrl(),
      center: CATALONIA_CENTER,
      zoom: DEFAULT_ZOOM,
      attributionControl: { compact: true },
    });
    map.scrollZoom.disable();
    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current.clear();
      elementsRef.current.clear();
    };
  }, []);

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

          marker = new maplibregl.Marker({ element: el, anchor: 'center' })
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

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="absolute inset-0" />

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
