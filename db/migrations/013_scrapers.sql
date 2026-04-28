-- 013_scrapers.sql
-- Wire up the scraping pipeline:
--   1. Extend public.listings with scraper-lifecycle columns (source_kind,
--      source_host, crawl_id, description).
--   2. Create public.crawl_runs to track each scrape execution.
--   3. Seed the 16 missing Ripollès municipalities into public.cities so
--      listings.city_slug FK resolves for that comarca.
--   4. mark_stale_listings() — flips removed_at after 30 days of no refresh.
--   5. pg_cron schedule for the stale-listing job, nightly 03:30 Europe/Madrid.
--
-- Streaming model: pipeline.py upserts rows one at a time with
--   on conflict (id) do update set scraped_at = now(), removed_at = null, ...
-- so a re-appeared listing auto-un-delists.

begin;

-- 1. listings: scraper lifecycle columns
alter table public.listings
  add column if not exists source_kind text not null default 'major'
    check (source_kind in ('major','local')),
  add column if not exists source_host text,
  add column if not exists crawl_id   uuid,
  add column if not exists description text;

-- Helpful indexes for the scrape + read paths.
create index if not exists idx_listings_active
  on public.listings (scraped_at desc)
  where removed_at is null;

create index if not exists idx_listings_platform_pid
  on public.listings (platform, platform_id);

create index if not exists idx_listings_source_host
  on public.listings (source_host)
  where source_host is not null;

create index if not exists idx_listings_city_active
  on public.listings (city_slug)
  where removed_at is null;

-- 2. crawl_runs
create table if not exists public.crawl_runs (
  id              uuid primary key default gen_random_uuid(),
  platform        text not null,
  source_host     text,
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  status          text not null default 'running'
                    check (status in ('running','ok','partial','error')),
  pages_fetched   integer not null default 0,
  listings_seen   integer not null default 0,
  error_count     integer not null default 0,
  notes           text
);

create index if not exists idx_crawl_runs_started_at
  on public.crawl_runs (started_at desc);

alter table public.crawl_runs enable row level security;

-- Anon read of crawl history (useful for an admin dashboard later).
drop policy if exists crawl_runs_anon_read on public.crawl_runs;
create policy crawl_runs_anon_read
  on public.crawl_runs
  for select
  using (true);

-- 3. Seed missing Ripollès municipalities
-- Population from Idescat 2024 estimates; coords are town-hall approximate
-- (sufficient for scrape anchors / comarca grouping).
insert into public.cities
  (slug, name, name_es, comarca_slug, province, country, population, location, in_zona_tensionada)
values
  ('campdevanol',                'Campdevànol',                'Campdevánol',                'ripolles', 'Girona', 'ES', 3258, ST_SetSRID(ST_MakePoint(2.169, 42.231), 4326), false),
  ('gombren',                    'Gombrèn',                    'Gombreny',                   'ripolles', 'Girona', 'ES',  175, ST_SetSRID(ST_MakePoint(2.108, 42.245), 4326), false),
  ('les-llosses',                'Les Llosses',                'Las Llosas',                 'ripolles', 'Girona', 'ES',  213, ST_SetSRID(ST_MakePoint(2.082, 42.108), 4326), false),
  ('llanars',                    'Llanars',                    'Llanars',                    'ripolles', 'Girona', 'ES',  591, ST_SetSRID(ST_MakePoint(2.366, 42.293), 4326), false),
  ('mollo',                      'Molló',                      'Molló',                      'ripolles', 'Girona', 'ES',  359, ST_SetSRID(ST_MakePoint(2.405, 42.354), 4326), false),
  ('ogassa',                     'Ogassa',                     'Ogassa',                     'ripolles', 'Girona', 'ES',  234, ST_SetSRID(ST_MakePoint(2.265, 42.265), 4326), false),
  ('pardines',                   'Pardines',                   'Pardinas',                   'ripolles', 'Girona', 'ES',  152, ST_SetSRID(ST_MakePoint(2.215, 42.314), 4326), false),
  ('planoles',                   'Planoles',                   'Planolas',                   'ripolles', 'Girona', 'ES',  281, ST_SetSRID(ST_MakePoint(2.107, 42.318), 4326), false),
  ('queralbs',                   'Queralbs',                   'Queralbs',                   'ripolles', 'Girona', 'ES',  165, ST_SetSRID(ST_MakePoint(2.163, 42.351), 4326), false),
  ('ribes-de-freser',            'Ribes de Freser',            'Ribas de Fresser',           'ripolles', 'Girona', 'ES', 1736, ST_SetSRID(ST_MakePoint(2.166, 42.305), 4326), false),
  ('sant-joan-de-les-abadesses', 'Sant Joan de les Abadesses', 'San Juan de las Abadesas',   'ripolles', 'Girona', 'ES', 3300, ST_SetSRID(ST_MakePoint(2.286, 42.236), 4326), false),
  ('sant-pau-de-seguries',       'Sant Pau de Segúries',       'San Pablo de Seguries',      'ripolles', 'Girona', 'ES',  597, ST_SetSRID(ST_MakePoint(2.367, 42.260), 4326), false),
  ('setcases',                   'Setcases',                   'Setcasas',                   'ripolles', 'Girona', 'ES',  178, ST_SetSRID(ST_MakePoint(2.300, 42.378), 4326), false),
  ('toses',                      'Toses',                      'Toses',                      'ripolles', 'Girona', 'ES',  159, ST_SetSRID(ST_MakePoint(2.020, 42.330), 4326), false),
  ('vallfogona-de-ripolles',     'Vallfogona de Ripollès',     'Vallfogona de Ripollés',     'ripolles', 'Girona', 'ES',  191, ST_SetSRID(ST_MakePoint(2.297, 42.187), 4326), false),
  ('vilallonga-de-ter',          'Vilallonga de Ter',          'Villalonga de Ter',          'ripolles', 'Girona', 'ES',  419, ST_SetSRID(ST_MakePoint(2.347, 42.341), 4326), false)
on conflict (slug) do nothing;

-- 4. Stale-listing mark function
-- 30-day grace gives the nightly scraper ~30 chances to re-confirm a listing
-- before we mark it removed. A re-appearing listing un-delists itself via the
-- upsert path in the Python pipeline (sets removed_at = null on conflict).
create or replace function public.mark_stale_listings()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  update public.listings
     set removed_at = now()
   where removed_at is null
     and scraped_at < now() - interval '30 days';
  get diagnostics n = row_count;
  return n;
end
$$;

comment on function public.mark_stale_listings() is
  'Flip listings.removed_at = now() for rows whose scraped_at is older than 30 days. Run nightly via pg_cron.';

-- 5. pg_cron schedule
-- pg_cron uses the database server timezone. We schedule at 03:30 server time;
-- if the server is in UTC that maps to ~05:30 Europe/Madrid in summer, ~04:30
-- in winter. Acceptable — the job is idempotent and grace is 30 days.
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    create extension if not exists pg_cron;
  end if;
exception
  when insufficient_privilege then
    raise notice 'pg_cron extension not available; nightly cron skipped (mark_stale_listings can be run manually).';
end$$;

do $$
begin
  perform cron.schedule(
    'bruixola-mark-stale-listings',
    '30 3 * * *',
    $cmd$select public.mark_stale_listings()$cmd$
  );
exception
  when undefined_function or undefined_schema then
    raise notice 'cron.schedule() unavailable; pg_cron not installed in this environment.';
  when unique_violation then
    -- Already scheduled.
    null;
end$$;

commit;
