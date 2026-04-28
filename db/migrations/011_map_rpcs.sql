-- =============================================================================
-- Migration 011 — Map RPCs (cities lng/lat + comarques GeoJSON)
-- =============================================================================
-- Adds two STABLE SECURITY INVOKER functions exposed to the anon/authenticated
-- roles so the COP page can fetch cities with extracted lng/lat numerics and
-- comarca polygons as GeoJSON strings via PostgREST RPC, without needing to
-- decode hex EWKB on the client.
--
-- Both functions follow the Supabase guidance:
--   - LANGUAGE sql
--   - STABLE
--   - SECURITY INVOKER
--   - SET search_path = '' so we always fully-qualify references
--   - GRANT EXECUTE to anon + authenticated for public read access
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- cities_for_map — every city with a location, lng/lat as numerics
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cities_for_map()
RETURNS TABLE (
  slug text,
  name text,
  name_es text,
  comarca_slug text,
  province text,
  population integer,
  in_zona_tensionada boolean,
  has_hospital boolean,
  has_university boolean,
  transit_score smallint,
  hut_moratorium_status text,
  rent_index_eur_m2_mo numeric,
  avg_sale_eur_m2 numeric,
  avg_rent_eur_m2_mo numeric,
  lng numeric,
  lat numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT
    c.slug,
    c.name,
    c.name_es,
    c.comarca_slug,
    c.province,
    c.population,
    c.in_zona_tensionada,
    c.has_hospital,
    c.has_university,
    c.transit_score,
    c.hut_moratorium_status::text,
    c.rent_index_eur_m2_mo,
    c.avg_sale_eur_m2,
    c.avg_rent_eur_m2_mo,
    public.ST_X(c.location::public.geometry)::numeric AS lng,
    public.ST_Y(c.location::public.geometry)::numeric AS lat
  FROM public.cities c
  WHERE c.location IS NOT NULL;
$$;

GRANT EXECUTE ON FUNCTION public.cities_for_map() TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- comarques_geojson — every comarca with its polygon as GeoJSON text
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.comarques_geojson()
RETURNS TABLE (
  slug text,
  name text,
  province text,
  population integer,
  in_zona_tensionada boolean,
  geojson text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT
    c.slug,
    c.name,
    c.province,
    c.population,
    c.in_zona_tensionada,
    public.ST_AsGeoJSON(c.polygon)::text AS geojson
  FROM public.comarques c
  WHERE c.polygon IS NOT NULL;
$$;

GRANT EXECUTE ON FUNCTION public.comarques_geojson() TO anon, authenticated;

COMMIT;
