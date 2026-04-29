'use client';

import 'mapbox-gl/dist/mapbox-gl.css';
import mapboxgl from 'mapbox-gl';
import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  CityForMap,
  ComarcaGeo,
  ListingMarker,
  MapMode,
  PricePoint,
  SelectedScope,
} from '@/lib/market';
import { comarcaStats } from '@/lib/market';

/** Variable rendered as the comarca choropleth. */
export type ChoroplethMetric = 'sale' | 'rent' | 'yield' | 'per' | 'tens';

export const CHOROPLETH_METRICS: ChoroplethMetric[] = [
  'sale',
  'rent',
  'yield',
  'per',
  'tens',
];

export const CHOROPLETH_METRIC_SHORT: Record<ChoroplethMetric, string> = {
  sale: 'Venda',
  rent: 'Lloguer',
  yield: 'Yield',
  per: 'PER',
  tens: 'Tensió',
};

export const CHOROPLETH_METRIC_LABEL: Record<ChoroplethMetric, string> = {
  sale: 'Preu venda · €/m²',
  rent: 'Lloguer · €/m²/mes',
  yield: 'Yield brut · %',
  per: 'PER · anys recup.',
  tens: '% en zona tensionada',
};

const METRICS = CHOROPLETH_METRICS;

const METRIC_FIELD: Record<ChoroplethMetric, string> = {
  sale: 'm_sale',
  rent: 'm_rent',
  yield: 'm_yield',
  per: 'm_per',
  tens: 'm_tens',
};

const METRIC_LABEL = CHOROPLETH_METRIC_LABEL;

const METRIC_FORMAT: Record<ChoroplethMetric, (n: number) => string> = {
  sale: (n) => Math.round(n).toString(),
  rent: (n) => n.toFixed(1),
  yield: (n) => `${n.toFixed(1)}%`,
  per: (n) => `${n.toFixed(0)}a`,
  tens: (n) => `${n.toFixed(0)}%`,
};

type Props = {
  cities: CityForMap[];
  comarques: ComarcaGeo[];
  listings: ListingMarker[];
  latestByCity: Record<string, PricePoint>;
  selectedScope: SelectedScope;
  onSelect: (s: SelectedScope) => void;
  mapMode: MapMode;
  metric: ChoroplethMetric;
};

/**
 * Stable per-id jitter so multiple listings sharing a city centroid don't
 * stack into one dot. Hash the id, derive a small (lng, lat) offset within
 * ±~0.012° (~1.3 km).
 */
function listingJitter(id: string): [number, number] {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  const angle = ((h % 360) * Math.PI) / 180;
  const radius = 0.004 + ((Math.abs(h >> 8) % 80) / 10000);
  return [Math.cos(angle) * radius, Math.sin(angle) * radius];
}

const CATALONIA_CENTER: [number, number] = [1.7, 41.65];
const DEFAULT_ZOOM = 7.6;

// Mapbox token — public-key style (pk.*) so it ships safely to the browser.
if (typeof window !== 'undefined') {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (token) {
    mapboxgl.accessToken = token;
  }
}

// Source / layer ids — extracted as constants so the cleanup phase can drop
// them by name on hot-reload.
const SRC_COMARQUES = 'b-comarques';
const SRC_CITIES = 'b-cities';
const SRC_LISTINGS = 'b-listings';
const LYR_COMARCAS_FILL = 'b-comarques-fill';
const LYR_COMARCAS_LINE = 'b-comarques-line';
const LYR_COMARCAS_HIGHLIGHT = 'b-comarques-highlight';
const LYR_CITIES_CIRCLE = 'b-cities-circle';
const LYR_CITIES_HIGHLIGHT = 'b-cities-highlight';
const LYR_LISTINGS_CIRCLE = 'b-listings-circle';

// We use the global GeoJSON namespace types so Mapbox accepts them directly.
type AnyGeometry = GeoJSON.Geometry;

// Quantile-bucket the comarques into 5 bins by avg_sale_eur_m2.
// Returns the breakpoint values (length 4) for use in a Mapbox `step` expression.
function quantileBreakpoints(values: number[]): number[] {
  if (values.length === 0) return [1500, 2000, 2500, 3000];
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q: number) =>
    sorted[
      Math.max(0, Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1))))
    ]!;
  return [at(0.2), at(0.4), at(0.6), at(0.8)];
}

// Compute the 5 choropleth metrics for one comarca from the latest prices
// per member city. Returns nulls where data is missing so Mapbox can fall
// through to the "no data" branch in the fill expression.
function comarcaMetrics(
  comarcaSlug: string,
  cities: CityForMap[],
  latestByCity: Map<string, PricePoint>,
): Record<ChoroplethMetric, number | null> {
  const s = comarcaStats(comarcaSlug, cities, latestByCity);
  const tensPct =
    s.memberCount === 0
      ? null
      : (s.zonaTensionadaCount / s.memberCount) * 100;
  return {
    sale: s.avgSaleEurM2,
    rent: s.avgRentEurM2Mo,
    yield: s.yieldP50,
    per: s.perYears,
    tens: tensPct,
  };
}

// MapView — centre column of the COP.
//
// Initialises Mapbox GL once, then drives:
//   - a comarca polygon FILL layer coloured by avg sale €/m² (choropleth)
//   - a comarca polygon LINE layer for borders
//   - a circle layer for the 178 city dots
//   - a highlight pair (comarca+city) responding to selectedScope
// Click events promote selection upward via onSelect.
export function MapView({
  cities,
  comarques,
  listings,
  latestByCity,
  selectedScope,
  onSelect,
  mapMode,
  metric,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const onSelectRef = useRef(onSelect);
  const styleLoadedRef = useRef(false);
  const [tokenMissing] = useState(
    () => !process.env.NEXT_PUBLIC_MAPBOX_TOKEN,
  );
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  // Pre-build the comarca FeatureCollection — every feature carries all five
  // metric values so flipping the selector is a paint-property update only.
  const { comarcaFC, breakpointsByMetric } = useMemo(() => {
    const latestMap = new Map(Object.entries(latestByCity));
    const features: GeoJSON.Feature<AnyGeometry>[] = comarques.map((c) => {
      let geometry: AnyGeometry;
      try {
        geometry = JSON.parse(c.geojson) as AnyGeometry;
      } catch {
        // Defensive: bad GeoJSON shouldn't kill the map. Drop it.
        geometry = { type: 'GeometryCollection', geometries: [] };
      }
      const m = comarcaMetrics(c.slug, cities, latestMap);
      return {
        type: 'Feature',
        id: c.slug,
        properties: {
          slug: c.slug,
          name: c.name,
          province: c.province,
          population: c.population ?? 0,
          in_zona_tensionada: c.in_zona_tensionada,
          [METRIC_FIELD.sale]: m.sale,
          [METRIC_FIELD.rent]: m.rent,
          [METRIC_FIELD.yield]: m.yield,
          [METRIC_FIELD.per]: m.per,
          [METRIC_FIELD.tens]: m.tens,
        },
        geometry,
      };
    });

    const bpsByMetric = {} as Record<ChoroplethMetric, number[]>;
    for (const k of METRICS) {
      const xs = features
        .map((f) => (f.properties as Record<string, unknown>)[METRIC_FIELD[k]])
        .filter((v): v is number => typeof v === 'number');
      bpsByMetric[k] = quantileBreakpoints(xs);
    }
    const fc: GeoJSON.FeatureCollection<AnyGeometry> = {
      type: 'FeatureCollection',
      features,
    };
    return { comarcaFC: fc, breakpointsByMetric: bpsByMetric };
  }, [comarques, cities, latestByCity]);

  const breakpoints = breakpointsByMetric[metric];

  // Pre-build the listings FeatureCollection (one Point per listing, jittered
  // around its city centroid).
  const listingFC = useMemo<GeoJSON.FeatureCollection<GeoJSON.Point>>(() => {
    const features: GeoJSON.Feature<GeoJSON.Point>[] = listings.map((l) => {
      const [dlng, dlat] = listingJitter(l.id);
      return {
        type: 'Feature',
        id: l.id,
        properties: {
          id: l.id,
          city_slug: l.city_slug,
          tens: l.in_zona_tensionada === true,
          tracked: l.tracked === true,
        },
        geometry: {
          type: 'Point',
          coordinates: [l.lng + dlng, l.lat + dlat],
        },
      };
    });
    return { type: 'FeatureCollection', features };
  }, [listings]);

  // Pre-build the city dots FeatureCollection.
  const cityFC = useMemo<GeoJSON.FeatureCollection<GeoJSON.Point>>(() => {
    const features: GeoJSON.Feature<GeoJSON.Point>[] = cities.map((c) => ({
      type: 'Feature',
      id: c.slug,
      properties: {
        slug: c.slug,
        name: c.name,
        comarca_slug: c.comarca_slug,
        in_zona_tensionada: c.in_zona_tensionada,
      },
      geometry: {
        type: 'Point',
        coordinates: [c.lng, c.lat],
      },
    }));
    return { type: 'FeatureCollection', features };
  }, [cities]);

  // Init map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    if (tokenMissing) return;

    const container = containerRef.current;
    let map: mapboxgl.Map;
    try {
      map = new mapboxgl.Map({
        container,
        style: 'mapbox://styles/mapbox/dark-v11',
        center: CATALONIA_CENTER,
        zoom: DEFAULT_ZOOM,
        attributionControl: false,
        // Cooperative gestures: on touch screens require 2-finger pan/zoom so
        // page scroll still works when the map fills the viewport (mobile UX).
        cooperativeGestures: true,
      });
    } catch (err) {
      setInitError(
        err instanceof Error ? err.message : 'No s’ha pogut iniciar el mapa',
      );
      return;
    }
    // Enable all standard interactions (defaults, made explicit so a future
    // refactor can't silently break trackpad zoom again).
    map.scrollZoom.enable();
    map.dragPan.enable();
    map.doubleClickZoom.enable();
    map.touchZoomRotate.enable();
    map.boxZoom.enable();
    map.addControl(new mapboxgl.NavigationControl(), 'top-right');
    map.addControl(
      new mapboxgl.AttributionControl({ compact: true }),
      'bottom-right',
    );
    mapRef.current = map;

    map.once('load', () => {
      styleLoadedRef.current = true;
    });

    // Resize fallbacks for Flexbox-collapses-the-canvas.
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
      styleLoadedRef.current = false;
    };
  }, [tokenMissing]);

  // Add / refresh sources + layers when the GeoJSON data is ready.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      // -- Comarca source ---------------------------------------------------
      const existingComarques = map.getSource(SRC_COMARQUES) as
        | mapboxgl.GeoJSONSource
        | undefined;
      if (!existingComarques) {
        map.addSource(SRC_COMARQUES, {
          type: 'geojson',
          data: comarcaFC,
          promoteId: 'slug',
        });
      } else {
        existingComarques.setData(comarcaFC);
      }

      // -- City source ------------------------------------------------------
      const existingCities = map.getSource(SRC_CITIES) as
        | mapboxgl.GeoJSONSource
        | undefined;
      if (!existingCities) {
        map.addSource(SRC_CITIES, {
          type: 'geojson',
          data: cityFC,
          promoteId: 'slug',
        });
      } else {
        existingCities.setData(cityFC);
      }

      // -- Listings source --------------------------------------------------
      const existingListings = map.getSource(SRC_LISTINGS) as
        | mapboxgl.GeoJSONSource
        | undefined;
      if (!existingListings) {
        map.addSource(SRC_LISTINGS, {
          type: 'geojson',
          data: listingFC,
          promoteId: 'id',
        });
      } else {
        existingListings.setData(listingFC);
      }

      // -- Comarca FILL layer (choropleth) ---------------------------------
      // Quantile-bucketed cyan ramp; missing data renders neutral bg-3.
      // Slightly translucent so dark basemap labels still read through.
      const field = METRIC_FIELD[metric];
      const fillExpr: mapboxgl.ExpressionSpecification = [
        'case',
        ['==', ['get', field], null],
        '#1a2733',
        [
          'step',
          ['get', field],
          '#1f3850', // < bp0
          breakpoints[0]!,
          '#2a5a78',
          breakpoints[1]!,
          '#3879a0',
          breakpoints[2]!,
          '#4d9bc5',
          breakpoints[3]!,
          '#82d2ee', // ≥ bp3 — phosphor cyan
        ],
      ];

      if (!map.getLayer(LYR_COMARCAS_FILL)) {
        map.addLayer({
          id: LYR_COMARCAS_FILL,
          type: 'fill',
          source: SRC_COMARQUES,
          paint: {
            'fill-color': fillExpr,
            'fill-opacity': [
              'case',
              ['boolean', ['feature-state', 'hover'], false],
              0.65,
              0.45,
            ],
          },
        });
      } else {
        map.setPaintProperty(LYR_COMARCAS_FILL, 'fill-color', fillExpr);
      }

      // -- Comarca LINE layer ---------------------------------------------
      if (!map.getLayer(LYR_COMARCAS_LINE)) {
        map.addLayer({
          id: LYR_COMARCAS_LINE,
          type: 'line',
          source: SRC_COMARQUES,
          paint: {
            'line-color': '#2a4258',
            'line-width': 0.6,
          },
        });
      }

      // -- Comarca highlight (selected) -----------------------------------
      if (!map.getLayer(LYR_COMARCAS_HIGHLIGHT)) {
        map.addLayer({
          id: LYR_COMARCAS_HIGHLIGHT,
          type: 'line',
          source: SRC_COMARQUES,
          paint: {
            'line-color': '#82d2ee',
            'line-width': [
              'case',
              ['boolean', ['feature-state', 'selected'], false],
              2.2,
              0,
            ],
          },
        });
      }

      // -- City circle layer ----------------------------------------------
      if (!map.getLayer(LYR_CITIES_CIRCLE)) {
        map.addLayer({
          id: LYR_CITIES_CIRCLE,
          type: 'circle',
          source: SRC_CITIES,
          paint: {
            'circle-radius': [
              'case',
              ['boolean', ['feature-state', 'hover'], false],
              5,
              3.2,
            ],
            'circle-color': [
              'case',
              ['get', 'in_zona_tensionada'],
              '#e8b25c', // amber for tensionada
              '#5fb4d4', // cyan otherwise
            ],
            'circle-stroke-width': 1,
            'circle-stroke-color': '#0a0e14',
            'circle-opacity': 0.95,
          },
        });
      }

      // -- Listings circles ------------------------------------------------
      // Sized by zoom + selection state. Tracked listings get a white outer
      // ring so the user can see at a glance which ones they're following.
      if (!map.getLayer(LYR_LISTINGS_CIRCLE)) {
        map.addLayer({
          id: LYR_LISTINGS_CIRCLE,
          type: 'circle',
          source: SRC_LISTINGS,
          paint: {
            // Mapbox requires `['zoom']` at the top of a paint expression,
            // so the zoom interpolate must wrap the case expression. At each
            // zoom stop we evaluate selected/hover/default; Mapbox tweens
            // between the stops linearly.
            'circle-radius': [
              'interpolate',
              ['linear'],
              ['zoom'],
              7,
              [
                'case',
                ['boolean', ['feature-state', 'selected'], false],
                6,
                ['boolean', ['feature-state', 'hover'], false],
                4,
                2.4,
              ],
              13,
              [
                'case',
                ['boolean', ['feature-state', 'selected'], false],
                10,
                ['boolean', ['feature-state', 'hover'], false],
                7,
                5.2,
              ],
            ],
            'circle-color': [
              'case',
              ['boolean', ['get', 'tens'], false],
              '#e8b25c',
              '#82d2ee',
            ],
            'circle-stroke-width': [
              'case',
              ['boolean', ['feature-state', 'selected'], false],
              2.5,
              ['boolean', ['get', 'tracked'], false],
              2,
              0.8,
            ],
            'circle-stroke-color': [
              'case',
              ['boolean', ['feature-state', 'selected'], false],
              '#ffffff',
              ['boolean', ['get', 'tracked'], false],
              '#ffffff',
              '#0a0e14',
            ],
            'circle-opacity': 0.92,
          },
        });
      }

      // -- City highlight (selected) -------------------------------------
      if (!map.getLayer(LYR_CITIES_HIGHLIGHT)) {
        map.addLayer({
          id: LYR_CITIES_HIGHLIGHT,
          type: 'circle',
          source: SRC_CITIES,
          paint: {
            'circle-radius': [
              'case',
              ['boolean', ['feature-state', 'selected'], false],
              7,
              0,
            ],
            'circle-color': 'rgba(0,0,0,0)',
            'circle-stroke-width': 2,
            'circle-stroke-color': '#82d2ee',
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
  }, [comarcaFC, cityFC, listingFC, breakpoints, metric]);

  // Toggle layer visibility per mapMode — zones mode hides listings;
  // listings mode dims comarca fill and hides city centroids so the dots dominate.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const inZones = mapMode === 'zones';
      const inListings = mapMode === 'listings';
      const setIfExists = (id: string, vis: 'visible' | 'none') => {
        if (map.getLayer(id)) {
          map.setLayoutProperty(id, 'visibility', vis);
        }
      };
      setIfExists(LYR_LISTINGS_CIRCLE, inListings ? 'visible' : 'none');
      setIfExists(LYR_CITIES_CIRCLE, inZones ? 'visible' : 'none');
      setIfExists(LYR_CITIES_HIGHLIGHT, inZones ? 'visible' : 'none');
      // Comarca fill stays visible in both modes but fades to a backdrop in
      // listings mode so the dots read clearly on top.
      if (map.getLayer(LYR_COMARCAS_FILL)) {
        map.setPaintProperty(
          LYR_COMARCAS_FILL,
          'fill-opacity',
          inListings
            ? [
                'case',
                ['boolean', ['feature-state', 'hover'], false],
                0.25,
                0.15,
              ]
            : [
                'case',
                ['boolean', ['feature-state', 'hover'], false],
                0.65,
                0.45,
              ],
        );
      }
    };
    if (map.isStyleLoaded() && styleLoadedRef.current) apply();
    else map.once('load', apply);
  }, [mapMode]);

  // Wire interactions: hover + click for both layers.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    let hoverComarca: string | number | null = null;
    let hoverCity: string | number | null = null;

    const onComarcaMove = (e: mapboxgl.MapLayerMouseEvent) => {
      map.getCanvas().style.cursor = 'pointer';
      const f = e.features?.[0];
      if (!f || f.id == null) return;
      if (hoverComarca != null && hoverComarca !== f.id) {
        map.setFeatureState(
          { source: SRC_COMARQUES, id: hoverComarca },
          { hover: false },
        );
      }
      hoverComarca = f.id;
      map.setFeatureState(
        { source: SRC_COMARQUES, id: f.id },
        { hover: true },
      );
    };
    const onComarcaLeave = () => {
      map.getCanvas().style.cursor = '';
      if (hoverComarca != null) {
        map.setFeatureState(
          { source: SRC_COMARQUES, id: hoverComarca },
          { hover: false },
        );
        hoverComarca = null;
      }
    };
    const onComarcaClick = (e: mapboxgl.MapLayerMouseEvent) => {
      const f = e.features?.[0];
      if (!f) return;
      const slug = String(f.properties?.slug ?? f.id ?? '');
      if (slug) onSelectRef.current({ kind: 'comarca', id: slug });
    };

    const onCityMove = (e: mapboxgl.MapLayerMouseEvent) => {
      map.getCanvas().style.cursor = 'pointer';
      const f = e.features?.[0];
      if (!f || f.id == null) return;
      if (hoverCity != null && hoverCity !== f.id) {
        map.setFeatureState(
          { source: SRC_CITIES, id: hoverCity },
          { hover: false },
        );
      }
      hoverCity = f.id;
      map.setFeatureState({ source: SRC_CITIES, id: f.id }, { hover: true });
    };
    const onCityLeave = () => {
      if (hoverCity != null) {
        map.setFeatureState(
          { source: SRC_CITIES, id: hoverCity },
          { hover: false },
        );
        hoverCity = null;
      }
    };
    const onCityClick = (e: mapboxgl.MapLayerMouseEvent) => {
      // Stop the click propagating to the comarca layer underneath.
      e.originalEvent?.stopPropagation();
      const f = e.features?.[0];
      if (!f) return;
      const slug = String(f.properties?.slug ?? f.id ?? '');
      if (slug) onSelectRef.current({ kind: 'city', id: slug });
    };

    const onListingEnter = () => {
      map.getCanvas().style.cursor = 'pointer';
    };
    const onListingLeave = () => {
      map.getCanvas().style.cursor = '';
    };
    const onListingClick = (e: mapboxgl.MapLayerMouseEvent) => {
      e.originalEvent?.stopPropagation();
      const f = e.features?.[0];
      if (!f) return;
      const id = String(f.properties?.id ?? f.id ?? '');
      if (id) onSelectRef.current({ kind: 'listing', id });
    };

    map.on('mousemove', LYR_COMARCAS_FILL, onComarcaMove);
    map.on('mouseleave', LYR_COMARCAS_FILL, onComarcaLeave);
    map.on('click', LYR_COMARCAS_FILL, onComarcaClick);
    map.on('mousemove', LYR_CITIES_CIRCLE, onCityMove);
    map.on('mouseleave', LYR_CITIES_CIRCLE, onCityLeave);
    map.on('click', LYR_CITIES_CIRCLE, onCityClick);
    map.on('mouseenter', LYR_LISTINGS_CIRCLE, onListingEnter);
    map.on('mouseleave', LYR_LISTINGS_CIRCLE, onListingLeave);
    map.on('click', LYR_LISTINGS_CIRCLE, onListingClick);

    return () => {
      map.off('mousemove', LYR_COMARCAS_FILL, onComarcaMove);
      map.off('mouseleave', LYR_COMARCAS_FILL, onComarcaLeave);
      map.off('click', LYR_COMARCAS_FILL, onComarcaClick);
      map.off('mousemove', LYR_CITIES_CIRCLE, onCityMove);
      map.off('mouseleave', LYR_CITIES_CIRCLE, onCityLeave);
      map.off('click', LYR_CITIES_CIRCLE, onCityClick);
      map.off('mouseenter', LYR_LISTINGS_CIRCLE, onListingEnter);
      map.off('mouseleave', LYR_LISTINGS_CIRCLE, onListingLeave);
      map.off('click', LYR_LISTINGS_CIRCLE, onListingClick);
    };
  }, []);

  // Reflect selection state on the map's feature-state.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      // Clear all previous selected states. Cheap — at most 41+178+~200 features.
      for (const c of comarques) {
        map.setFeatureState(
          { source: SRC_COMARQUES, id: c.slug },
          { selected: false },
        );
      }
      for (const c of cities) {
        map.setFeatureState(
          { source: SRC_CITIES, id: c.slug },
          { selected: false },
        );
      }
      for (const l of listings) {
        map.setFeatureState(
          { source: SRC_LISTINGS, id: l.id },
          { selected: false },
        );
      }
      if (selectedScope.kind === 'comarca' && selectedScope.id) {
        map.setFeatureState(
          { source: SRC_COMARQUES, id: selectedScope.id },
          { selected: true },
        );
      } else if (selectedScope.kind === 'city' && selectedScope.id) {
        map.setFeatureState(
          { source: SRC_CITIES, id: selectedScope.id },
          { selected: true },
        );
      } else if (selectedScope.kind === 'listing' && selectedScope.id) {
        map.setFeatureState(
          { source: SRC_LISTINGS, id: selectedScope.id },
          { selected: true },
        );
      }
    };
    if (map.isStyleLoaded() && styleLoadedRef.current) {
      apply();
    } else {
      map.once('load', apply);
    }
  }, [selectedScope, cities, comarques, listings]);

  // Fly-to when a city or listing is selected.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (selectedScope.kind === 'city') {
      const c = cities.find((x) => x.slug === selectedScope.id);
      if (c) {
        map.flyTo({
          center: [c.lng, c.lat],
          zoom: Math.max(map.getZoom(), 10),
          speed: 0.9,
        });
      }
    } else if (selectedScope.kind === 'listing') {
      const l = listings.find((x) => x.id === selectedScope.id);
      if (l) {
        map.flyTo({
          center: [l.lng, l.lat],
          zoom: Math.max(map.getZoom(), 11),
          speed: 0.9,
        });
      }
    }
  }, [selectedScope, cities, listings]);

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

      {/* Map overlay — coordinate stamp (analytical surface flourish). */}
      <div className="pointer-events-none absolute left-3 top-3 z-10 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">
        Catalunya · OPS · {cities.length} municipis · {comarques.length} comarques · {listings.length} anuncis
      </div>

      {/* Choropleth legend, bottom-left */}
      <div className="pointer-events-none absolute bottom-3 left-3 z-10 border border-line-1 bg-bg-1/85 px-3 py-2 backdrop-blur-sm">
        <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-3">
          {METRIC_LABEL[metric]}
        </div>
        <div className="mt-1.5 flex items-center gap-1">
          {['#1f3850', '#2a5a78', '#3879a0', '#4d9bc5', '#82d2ee'].map((c, i) => (
            <span
              key={c}
              className="block h-2.5 w-7"
              style={{ backgroundColor: c }}
              aria-label={`bin ${i + 1}`}
            />
          ))}
        </div>
        <div className="mt-1 flex w-[155px] justify-between font-mono text-[9px] text-ink-3">
          <span>{breakpoints[0] != null ? METRIC_FORMAT[metric](breakpoints[0]) : '—'}</span>
          <span>{breakpoints[3] != null ? METRIC_FORMAT[metric](breakpoints[3]) : '—'}</span>
        </div>
      </div>
    </div>
  );
}
