'use client';

import 'mapbox-gl/dist/mapbox-gl.css';
import mapboxgl from 'mapbox-gl';
import Link from 'next/link';
import type { Route } from 'next';
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatEur, formatM2, formatPct } from '@/lib/format';

/**
 * Slim property shape the map needs. Server resolves coordinates from the
 * city centroid (RPC `cities_for_map`); when a property has its own
 * `location` PostGIS point set, that wins. Properties without a resolvable
 * coordinate are omitted from the map and listed in the "no location"
 * footer chip instead.
 */
export type PropertyMarker = {
  id: string;
  title: string;
  address: string | null;
  city_slug: string;
  city_name: string;
  lng: number;
  lat: number;
  price_eur: number;
  m2: number | null;
  beds: number | null;
  yield_p50: number | null;
  in_zona_tensionada: boolean | null;
};

type Props = {
  markers: PropertyMarker[];
  unresolvedCount: number;
};

const CATALONIA_CENTER: [number, number] = [1.7, 41.65];
const DEFAULT_ZOOM = 7.6;

const SRC = 'b-properties';
const LYR = 'b-properties-circle';

if (typeof window !== 'undefined') {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (token) mapboxgl.accessToken = token;
}

/**
 * Stable jitter so multiple properties at the same city centroid don't
 * stack into a single dot. Hash the property id, derive a small (lng, lat)
 * offset within ±0.012° (~1.3 km).
 */
function jitter(id: string): [number, number] {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) | 0;
  }
  const angle = ((h % 360) * Math.PI) / 180;
  const radius = 0.004 + ((Math.abs(h >> 8) % 80) / 10000); // 0.004°–0.012°
  return [Math.cos(angle) * radius, Math.sin(angle) * radius];
}

export function PropertiesMap({ markers, unresolvedCount }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const styleLoadedRef = useRef(false);
  const [tokenMissing] = useState(
    () => !process.env.NEXT_PUBLIC_MAPBOX_TOKEN,
  );
  const [selected, setSelected] = useState<PropertyMarker | null>(null);

  const fc = useMemo<GeoJSON.FeatureCollection<GeoJSON.Point>>(() => {
    return {
      type: 'FeatureCollection',
      features: markers.map((m) => {
        const [dlng, dlat] = jitter(m.id);
        return {
          type: 'Feature',
          id: m.id,
          properties: { id: m.id },
          geometry: {
            type: 'Point',
            coordinates: [m.lng + dlng, m.lat + dlat],
          },
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
    map.scrollZoom.enable();
    map.dragPan.enable();
    map.addControl(new mapboxgl.NavigationControl(), 'top-right');
    map.addControl(
      new mapboxgl.AttributionControl({ compact: true }),
      'bottom-right',
    );
    mapRef.current = map;
    map.once('load', () => {
      styleLoadedRef.current = true;
    });

    // Resize fallbacks (Flexbox can collapse the canvas before first paint).
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

  // Add / refresh source + layer when data ready.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      const existing = map.getSource(SRC) as
        | mapboxgl.GeoJSONSource
        | undefined;
      if (!existing) {
        map.addSource(SRC, {
          type: 'geojson',
          data: fc,
          promoteId: 'id',
        });
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
              'case',
              ['boolean', ['feature-state', 'selected'], false],
              8,
              ['boolean', ['feature-state', 'hover'], false],
              6,
              4.5,
            ],
            'circle-color': '#5fb4d4',
            'circle-stroke-width': 1.5,
            'circle-stroke-color': '#0a0e14',
            'circle-opacity': 0.95,
          },
        });
      }
    };

    if (map.isStyleLoaded() && styleLoadedRef.current) {
      apply();
    } else {
      const onLoad = () => {
        styleLoadedRef.current = true;
        apply();
      };
      map.once('load', onLoad);
    }
  }, [fc]);

  // Wire interactions.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    let hovered: string | number | null = null;
    const onMove = (e: mapboxgl.MapLayerMouseEvent) => {
      map.getCanvas().style.cursor = 'pointer';
      const f = e.features?.[0];
      if (!f || f.id == null) return;
      if (hovered != null && hovered !== f.id) {
        map.setFeatureState({ source: SRC, id: hovered }, { hover: false });
      }
      hovered = f.id;
      map.setFeatureState({ source: SRC, id: f.id }, { hover: true });
    };
    const onLeave = () => {
      map.getCanvas().style.cursor = '';
      if (hovered != null) {
        map.setFeatureState({ source: SRC, id: hovered }, { hover: false });
        hovered = null;
      }
    };
    const onClick = (e: mapboxgl.MapLayerMouseEvent) => {
      const f = e.features?.[0];
      if (!f) return;
      const id = String(f.properties?.id ?? f.id ?? '');
      const m = markers.find((x) => x.id === id) ?? null;
      setSelected(m);
    };

    map.on('mousemove', LYR, onMove);
    map.on('mouseleave', LYR, onLeave);
    map.on('click', LYR, onClick);
    return () => {
      map.off('mousemove', LYR, onMove);
      map.off('mouseleave', LYR, onLeave);
      map.off('click', LYR, onClick);
    };
  }, [markers]);

  // Reflect selected feature on the map.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      for (const m of markers) {
        map.setFeatureState({ source: SRC, id: m.id }, { selected: false });
      }
      if (selected) {
        map.setFeatureState(
          { source: SRC, id: selected.id },
          { selected: true },
        );
        map.flyTo({
          center: [selected.lng, selected.lat],
          zoom: Math.max(map.getZoom(), 11),
          speed: 0.9,
        });
      }
    };
    if (map.isStyleLoaded() && styleLoadedRef.current) {
      apply();
    } else {
      map.once('load', apply);
    }
  }, [selected, markers]);

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
              Configura NEXT_PUBLIC_MAPBOX_TOKEN a apps/web/.env.local
            </div>
          </div>
        </div>
      )}

      {/* Stamp top-left */}
      <div className="pointer-events-none absolute left-3 top-3 z-10 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">
        Propietats · {markers.length} al mapa
        {unresolvedCount > 0 ? ` · ${unresolvedCount} sense ubicació` : ''}
      </div>

      {/* Selected drawer, bottom-right */}
      {selected && (
        <div className="absolute bottom-3 right-3 z-20 w-[320px] border border-line-1 bg-bg-1/95 p-4 backdrop-blur-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-cyan">
                {selected.city_name}
              </div>
              <div className="mt-1 font-display text-[14px] leading-tight text-ink-0">
                {selected.title || selected.address || selected.id.slice(0, 8)}
              </div>
              {selected.address && selected.title ? (
                <div className="mt-0.5 text-[11px] text-ink-3">
                  {selected.address}
                </div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => setSelected(null)}
              aria-label="Tanca"
              className="font-mono text-[10px] text-ink-3 hover:text-ink-0"
            >
              ✕
            </button>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2 border-t border-line-1 pt-3 text-[11px]">
            <Stat label="Preu" value={formatEur(selected.price_eur)} />
            <Stat label="m²" value={formatM2(selected.m2)} />
            <Stat
              label="Yield P50"
              value={formatPct(selected.yield_p50)}
              tone={
                selected.in_zona_tensionada === true ? 'amber' : undefined
              }
            />
          </div>

          <div className="mt-3 border-t border-line-1 pt-3">
            <Link
              href={`/properties/${selected.id}` as Route}
              className="font-mono text-[10px] uppercase tracking-[0.18em] text-cyan hover:text-cyan-hot"
            >
              Obrir fitxa →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'amber';
}) {
  return (
    <div>
      <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-ink-3">
        {label}
      </div>
      <div
        className={`mt-0.5 font-mono tabular-nums ${
          tone === 'amber' ? 'text-amber' : 'text-ink-0'
        }`}
      >
        {value}
      </div>
    </div>
  );
}
