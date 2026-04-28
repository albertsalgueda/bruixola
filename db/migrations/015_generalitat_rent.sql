-- 015_generalitat_rent.sql
-- Wire up the Generalitat de Catalunya open-data feeds:
--   1. cities gets codi_ine (5-digit INE municipality code) for joins, plus
--      zmrt_level (official zona-tensionada classification — ZMRT 1, ZMRT 2,
--      or null), ambit_funcional, and area_ptsh from dataset fftm-v9b6.
--   2. New municipal_rent_index table holds the historical rent series from
--      dataset qww9-bvhh (Preu mitjà del lloguer d'habitatges per municipi).
--
-- Source URLs:
--   https://analisi.transparenciacatalunya.cat/resource/fftm-v9b6.json
--   https://analisi.transparenciacatalunya.cat/resource/qww9-bvhh.json
--
-- Rationale:
--   - in_zona_tensionada is currently false everywhere because we never had
--     authoritative source. fftm-v9b6 covers all 947 Catalan municipalities;
--     271 are ZMRT 1 or ZMRT 2 (the rest are NA).
--   - Yield calculations gated by Llei 12/2023 (zonas tensionadas) need the
--     ZMRT level + a rent benchmark per municipality.
--   - The rent dataset is per-dwelling-month (renda), not €/m²/month — so
--     we store the raw series and can derive €/m² later when we know dwelling
--     size distributions per municipality.

begin;

-- 1. Extend cities with Generalitat reference fields
alter table public.cities
  add column if not exists codi_ine text,
  add column if not exists zmrt_level text
    check (zmrt_level is null or zmrt_level in ('ZMRT 1', 'ZMRT 2')),
  add column if not exists ambit_funcional text,
  add column if not exists area_ptsh text;

create index if not exists idx_cities_codi_ine on public.cities (codi_ine);
create index if not exists idx_cities_zmrt on public.cities (zmrt_level)
  where zmrt_level is not null;

-- 2. Municipal rent index — historical series per municipality + period
create table if not exists public.municipal_rent_index (
  codi_ine        text not null,
  any_            integer not null,
  periode         text not null,
  habitatges      integer,           -- sample size
  renda_eur_mo    numeric,           -- avg monthly rent per dwelling
  tram_preus      text,              -- categorical band ("> 450 i <= 600 euros/mes")
  source          text not null default 'analisi.transparenciacatalunya.cat:qww9-bvhh',
  loaded_at       timestamptz not null default now(),
  primary key (codi_ine, any_, periode)
);

create index if not exists idx_mri_codi_ine on public.municipal_rent_index (codi_ine, any_ desc);

alter table public.municipal_rent_index enable row level security;

-- Public read of the rent index (it's already public Generalitat data).
drop policy if exists municipal_rent_index_anon_read on public.municipal_rent_index;
create policy municipal_rent_index_anon_read
  on public.municipal_rent_index
  for select
  using (true);

commit;
