'use client';

import 'mapbox-gl/dist/mapbox-gl.css';
import mapboxgl from 'mapbox-gl';
import { useEffect, useMemo, useRef, useState } from 'react';

export type ListingMapMarker = {
  id: string;
  lng: number;
  lat: number;
  in_zona_tensionada: boolean | null;
  /** True if the current user already tracks this listing as a property. */
  tracked?: boolean;
};

type Props = {
  markers: ListingMapMarker[];
  unresolvedCount: number;
};

const CATALONIA_CENTER: [number, number] = [1.7, 41.65];
const DEFAULT_ZOOM = 7.6;
const SRC = 'b-ll';
const LYR = 'b-ll-circle';

if (typeof window !== 'undefined') {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (token) mapboxgl.accessToken = token;
}

/** Stable per-id jitter — see /properties/properties-map.tsx for the same trick. */
function jitter(id: string): [number, number] {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  const angle = ((h % 360) * Math.PI) / 180;
  const radius = 0.004 + ((Math.abs(h >> 8) % 80) / 10000);
  return [Math.cos(angle) * radius, Math.sin(angle) * radius];
}

/**
 * Listings map — public scraped anuncis as dots. Click a dot → navigate to
 * `/listing/[id]`. Cyan = unsaved; ambar = zona tensionada; ring = ja seguint.
 *
 * Coordinates come from the listing's city centroid (server-resolved); we
 * apply hash-based jitter so listings sharing a city don't stack.
 */
export function ListingsMap({ markers, unresolvedCount }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const styleLoadedRef = useRef(false);
  const [tokenMissing] = useState(
    () => !process.env.NEXT_PUBLIC_MAPBOX_TOKEN,
  );

  const fc = useMemo<GeoJSON.FeatureCollection<GeoJSON.Point>>(() => {
    return {
      type: 'FeatureCollection',
      features: markers.map((m) => {
        const [dlng, dlat] = jitter(m.id);
        return {
          type: 'Feature',
          id: m.id,
          properties: {
            id: m.id,
            tens: m.in_zona_tensionada === true,
            tracked: m.tracked === true,
          },
          geometry: { type: 'Point', coordinates: [m.lng + dlng, m.lat + dlat] },
        };
      }),
    };
  }, [markers]);

  // Init map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current || tokenMissing) return;
    const container = containerRef.current;
    const map = new mapboxgl.Map({
      container,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: CATALONIA_CENTER,
      zoom: DEFAULT_ZOOM,
      attributionControl: false,
    });
    map.addControl(new mapboxgl.NavigationControl(), 'top-right');
    map.addControl(
      new mapboxgl.AttributionControl({ compact: true }),
      'bottom-right',
    );
    mapRef.current = map;
    map.once('load', () => {
      styleLoadedRef.current = true;
    });
    const kick = () => map.resize();
    requestAnimationFrame(kick);
    const t1 = setTimeout(kick, 120);
    const t2 = setTimeout(kick, 360);
    const ro = new ResizeObserver(kick);
    if (container.parentElement) ro.observe(container.parentElement);
    ro.observe(container);
    window.addEventListener('resize', kick);
    return () => {
      window.removeEventListener('resize', kick);
      clearTimeout(t1);
      clearTimeout(t2);
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      styleLoadedRef.current = false;
    };
  }, [tokenMissing]);

  // Source + layer.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const existing = map.getSource(SRC) as
        | mapboxgl.GeoJSONSource
        | undefined;
      if (!existing) {
        map.addSource(SRC, { type: 'geojson', data: fc, promoteId: 'id' });
      } else {
        existing.setData(fc);
      }
      if (!map.getLayer(LYR)) {
        map.addLayer({
          id: LYR,
          type: 'circle',
          source: SRC,
          paint: {
            'circle-radius': [
              'interpolate',
              ['linear'],
              ['zoom'],
              7,
              2.4,
              10,
              4,
              13,
              6,
            ],
            'circle-color': [
              'case',
              ['boolean', ['get', 'tens'], false],
              '#e8b25c',
              '#5fb4d4',
            ],
            'circle-stroke-width': [
              'case',
              ['boolean', ['get', 'tracked'], false],
              2,
              0.8,
            ],
            'circle-stroke-color': [
              'case',
              ['boolean', ['get', 'tracked'], false],
              '#ffffff',
              '#0a0e14',
            ],
            'circle-opacity': 0.9,
          },
        });
      }
    };
    if (map.isStyleLoaded() && styleLoadedRef.current) apply();
    else map.once('load', apply);
  }, [fc]);

  // Click → navigate.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const onEnter = () => {
      map.getCanvas().style.cursor = 'pointer';
    };
    const onLeave = () => {
      map.getCanvas().style.cursor = '';
    };
    const onClick = (e: mapboxgl.MapLayerMouseEvent) => {
      const f = e.features?.[0];
      if (!f) return;
      const id = String(f.properties?.id ?? f.id ?? '');
      if (id) window.location.href = `/listing/${id}`;
    };
    map.on('mouseenter', LYR, onEnter);
    map.on('mouseleave', LYR, onLeave);
    map.on('click', LYR, onClick);
    return () => {
      map.off('mouseenter', LYR, onEnter);
      map.off('mouseleave', LYR, onLeave);
      map.off('click', LYR, onClick);
    };
  }, []);

  return (
    <div className="relative h-[calc(100vh-220px)] min-h-[480px] w-full overflow-hidden border border-line-1 bg-bg-1">
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
              Configura NEXT_PUBLIC_MAPBOX_TOKEN
            </div>
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute left-3 top-3 z-10 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">
        Anuncis · {markers.length} al mapa
        {unresolvedCount > 0 ? ` · ${unresolvedCount} sense ubicació` : ''}
      </div>
      <div className="pointer-events-none absolute bottom-3 left-3 z-10 border border-line-1 bg-bg-1/85 px-3 py-2 backdrop-blur-sm">
        <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-3">
          Llegenda
        </div>
        <div className="mt-1.5 flex items-center gap-3 font-mono text-[10px] text-ink-2">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-cyan" />
            Anunci
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber" />
            Tensionada
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-cyan ring-2 ring-white" />
            Seguint
          </span>
        </div>
      </div>
    </div>
  );
}
