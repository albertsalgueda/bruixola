/**
 * Static city → [lng, lat] lookup with deterministic per-listing jitter.
 *
 * Wave 4 will expose PostGIS centroids as JSON; until then this module is the
 * single source of truth for "where does a listing live on the map?". Jitter
 * is keyed on listing id so a given pin always lands in the same spot —
 * stable across reloads, but spread out enough that pins in the same city
 * don't collapse into one dot.
 */

const CITY_COORDS: Record<string, [number, number]> = {
  reus: [1.1066, 41.1561],
  tarragona: [1.2445, 41.1189],
  cambrils: [1.0533, 41.066],
  barcelona: [2.1734, 41.3851],
  'l-hospitalet-de-llobregat': [2.0995, 41.3596],
  badalona: [2.2474, 41.4467],
  mataro: [2.4448, 41.5388],
  sabadell: [2.1075, 41.5483],
  terrassa: [2.0173, 41.564],
  manresa: [1.8265, 41.7256],
  vic: [2.2547, 41.9303],
  sitges: [1.8112, 41.2345],
  girona: [2.8237, 41.9818],
  camprodon: [2.364, 42.3098],
  roses: [3.1762, 42.2625],
};

export function cityCoords(slug: string): [number, number] | null {
  return CITY_COORDS[slug] ?? null;
}

/**
 * Stable per-listing jitter. Reads the first 8 hex chars of the listing id
 * as a uint32, then peels off two independent ~1-of-1000 offsets — one for
 * lng, one for lat — each in roughly ±0.007°. That's about ±500m at 41°N,
 * enough to fan out a dense neighborhood without crossing city lines.
 *
 * If the id isn't hex-parseable we fall back to a hash of the string so
 * non-UUID ids (e.g., 'demo-001') still render somewhere stable.
 */
export function listingCoords(listing: {
  id: string;
  city_slug: string;
}): [number, number] | null {
  const base = cityCoords(listing.city_slug);
  if (!base) return null;

  const seed = parseSeed(listing.id);
  const lngJitter = ((seed >>> 0) % 1000) / 1000 * 0.014 - 0.007;
  const latJitter = ((seed >>> 8) % 1000) / 1000 * 0.014 - 0.007;

  return [base[0] + lngJitter, base[1] + latJitter];
}

function parseSeed(id: string): number {
  const hex = id.replace(/-/g, '').slice(0, 8);
  const parsed = parseInt(hex, 16);
  if (!Number.isNaN(parsed)) return parsed;
  // Fallback: simple FNV-1a-ish 32-bit hash.
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
