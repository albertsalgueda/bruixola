-- 017_osm_amenities.sql
-- OpenStreetMap amenity points for Catalonia.
-- Source: Overpass API (`overpass-api.de/api/interpreter`), ODbL.
-- Refresh cadence: monthly (per-month for hospitals/universities/transit/schools)
-- or yearly (beaches). Stored once per layer; nightly ETL upserts on osm_id.

begin;

create table if not exists public.osm_amenities (
  osm_id          bigint not null,
  osm_type        text not null check (osm_type in ('node','way','relation')),
  kind            text not null check (kind in (
    'hospital','clinic','university','school',
    'train_station','metro_station','tram_stop','bus_station',
    'beach'
  )),
  name            text,
  -- Centroid for points / way-relation centers.
  lat             double precision not null,
  lng             double precision not null,
  -- For polygons (beaches) we keep raw GeoJSON for shoreline-distance queries.
  geometry_geojson jsonb,
  tags            jsonb,
  loaded_at       timestamptz not null default now(),
  primary key (osm_id, osm_type)
);

create index if not exists idx_osm_kind on public.osm_amenities (kind);

alter table public.osm_amenities enable row level security;

drop policy if exists osm_amenities_anon_read on public.osm_amenities;
create policy osm_amenities_anon_read
  on public.osm_amenities
  for select
  using (true);

commit;
