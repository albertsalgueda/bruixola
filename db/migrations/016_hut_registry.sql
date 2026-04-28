-- 016_hut_registry.sql
-- Catalan tourist-license (Habitatge d'Ús Turístic) registry.
-- Source: Generalitat Socrata dataset t2h3-cgys, monthly refresh.
--
-- We load HUT-relevant types only: Habitatges d'ús turístic (~105k),
-- Apartaments Turístics (~329), Llars compartides (~1.3k).
-- Skip Hotels / Càmpings / Autocaravanes / Turisme rural — those don't
-- match the residential listing scope.
--
-- Two join paths from listings:
--   1. listings.url → catastro_rc → hut_licenses.referencia_cadastral (~14.5%
--      of HUT rows have a cadastral ref — the cleanest match).
--   2. listings.address (normalized) → fuzzy match against composed address
--      atoms (tipus_de_via + nom_de_la_via + numero + pis + porta).

begin;

create table if not exists public.hut_licenses (
  license_id              text primary key,                  -- n_mero_inscripci
  digit_control           text,
  establishment_type      text not null
    check (establishment_type in (
      'Habitatges d''ús turístic',
      'Apartaments Turístics',
      'Llars compartides'
    )),
  trade_name              text,                              -- r_tol
  estat                   text not null default 'Alta',
  -- Cadastral join key (when available)
  referencia_cadastral    text,
  -- Address atoms (Generalitat publishes them split)
  tipus_de_via            text,
  nom_de_la_via           text,
  numero                  text,
  pis                     text,
  porta                   text,
  escala                  text,
  bloc                    text,
  postal_code             text,
  -- Geo refs
  codi_municipi_idescat   text,                              -- 6-digit IDESCAT
  codi_ine                text,                              -- 5-digit INE (derived)
  municipi                text,
  comarca                 text,
  comarca_codi            text,
  provincia               text,
  -- Capacity
  total_places            integer,
  total_estances          integer,
  -- Owner (kept for ops; consider stripping for privacy later)
  titular_cif             text,
  titular_nom             text,
  -- Loader stamps
  loaded_at               timestamptz not null default now(),
  raw_payload             jsonb
);

create index if not exists idx_hut_rc on public.hut_licenses (referencia_cadastral)
  where referencia_cadastral is not null;
create index if not exists idx_hut_codi_ine on public.hut_licenses (codi_ine);
create index if not exists idx_hut_municipi on public.hut_licenses (municipi);
create index if not exists idx_hut_postal on public.hut_licenses (postal_code);
create index if not exists idx_hut_type on public.hut_licenses (establishment_type);

alter table public.hut_licenses enable row level security;

-- Public read of HUT registry (it's already public Generalitat data).
drop policy if exists hut_licenses_anon_read on public.hut_licenses;
create policy hut_licenses_anon_read
  on public.hut_licenses
  for select
  using (true);

commit;
