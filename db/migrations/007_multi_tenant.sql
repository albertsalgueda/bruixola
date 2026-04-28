-- =============================================================================
-- Migration 007 — Multi-tenant pivot for Brúixola
-- =============================================================================
--
-- Brúixola moves from "single-user-with-fake-data" to a tenant-scoped product.
-- This migration:
--   A. Drops the seeded fake listings (the public listings table is preserved
--      and will be repurposed for public market signals — scrapes, etc.).
--   B. Adds tenants, tenant memberships, and per-tenant API keys (so the
--      OpenClaw agent and the laptop CLI can authenticate with brx_<random>
--      bearer tokens scoped to a specific tenant).
--   C. Adds a hand-curated pipeline_stages reference table.
--   D. Adds properties — the tenant's saved real-estate units (imported from
--      a public listing, or hand-entered).
--   E. Adds deals — a property's position in the buying pipeline.
--   F. Adds deal_notes + viewing_logs — the timeline of activity per deal.
--   G. Adds opportunities — agent-flagged follow-ups (price drops, alerts).
--   H. Adds agent_actions — full audit log of every tool call.
--   I. Enables RLS on every new table and writes member-scoped policies.
--      Backend writes use the service role and bypass RLS; RLS is the
--      defense-in-depth layer for any direct-from-client query.
--   J. Seeds Albert's tenant (id 00000000-0000-0000-0000-000000000001) so
--      the API can run in single-tenant mode via SUPABASE_DEFAULT_TENANT_ID.
--
-- Apply via Supabase MCP `apply_migration`. The MCP runs each migration in
-- a transaction, so this file is treated as one atomic unit — no manual
-- BEGIN/COMMIT needed (and adding one would break the MCP wrapper).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Part A — Drop fake listings
-- -----------------------------------------------------------------------------
-- The 30 fake listings were synthetic seed data. Truncate (don't drop) so the
-- table stays in place for scraped public market signals. CASCADE so any
-- dependent rows in price_history that reference listing-scoped scopes get
-- cleared too. RESTART IDENTITY is a no-op for text-PK tables but harmless.

TRUNCATE TABLE public.listings RESTART IDENTITY CASCADE;


-- -----------------------------------------------------------------------------
-- Part B — Tenants, tenant memberships, API keys
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.tenants (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         text UNIQUE NOT NULL CHECK (slug ~ '^[a-z0-9-]+$'),
  display_name text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.tenants IS
  'Top-level tenant boundary. One row per Brúixola customer. All tenant-scoped tables (properties, deals, opportunities, agent_actions, …) FK to this.';

CREATE TABLE IF NOT EXISTS public.tenant_users (
  tenant_id  uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id)     ON DELETE CASCADE,
  role       text NOT NULL CHECK (role IN ('owner','member','viewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id)
);
COMMENT ON TABLE public.tenant_users IS
  'Membership join between Supabase auth.users and tenants. Drives RLS for every tenant-scoped table. Roles: owner (full + API keys), member (read+write tenant data), viewer (read-only).';

CREATE INDEX IF NOT EXISTS tenant_users_user_idx ON public.tenant_users(user_id);

CREATE TABLE IF NOT EXISTS public.tenant_api_keys (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  label        text NOT NULL,                                 -- e.g. "albert-laptop-agent"
  token_hash   text NOT NULL UNIQUE,                          -- bcrypt-style hash of brx_<random>
  scopes       text[] NOT NULL DEFAULT '{tools:read,tools:write}',
  last_used_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  revoked_at   timestamptz                                    -- soft-revoke
);
COMMENT ON TABLE public.tenant_api_keys IS
  'Per-tenant bearer tokens (brx_<random>) used by the OpenClaw agent and CLI clients. token_hash is a bcrypt-style hash; the plaintext token is shown once at create-time. Soft-revoke via revoked_at.';

CREATE INDEX IF NOT EXISTS tenant_api_keys_tenant_idx
  ON public.tenant_api_keys(tenant_id)
  WHERE revoked_at IS NULL;


-- -----------------------------------------------------------------------------
-- Part C — Pipeline stages (hand-curated, public-read reference table)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.pipeline_stages (
  slug        text PRIMARY KEY CHECK (slug ~ '^[a-z0-9-]+$'),
  name        text NOT NULL,
  name_es     text,
  ord         integer NOT NULL UNIQUE,
  is_terminal boolean NOT NULL DEFAULT false,                 -- closed / dropped are terminal
  description text
);
COMMENT ON TABLE public.pipeline_stages IS
  'Hand-curated reference list of deal stages. Public-read (anon + authenticated) because the UI needs to render stage names regardless of session. Mutations are admin-only via service role.';

INSERT INTO public.pipeline_stages (slug, name, name_es, ord, is_terminal, description) VALUES
  ('descobert',  'Descobert',  'Descubierto',       10, false, 'Pis nou identificat'),
  ('en-revisio', 'En revisió', 'En revisión',       20, false, 'Avaluació inicial'),
  ('visitat',    'Visitat',    'Visitado',          30, false, 'Visita feta'),
  ('oferta',     'Oferta',     'Oferta presentada', 40, false, 'Oferta enviada'),
  ('tancat',     'Tancat',     'Cerrado',           50, true,  'Compra completada'),
  ('descartat',  'Descartat',  'Descartado',        60, true,  'Eliminat del pipeline')
ON CONFLICT (slug) DO NOTHING;


-- -----------------------------------------------------------------------------
-- Shared trigger function: bump updated_at on UPDATE
-- -----------------------------------------------------------------------------
-- SECURITY INVOKER (default) + SET search_path = '' so the function never
-- resolves an unqualified object name through a hostile schema (Supabase's
-- linter flags this).

CREATE OR REPLACE FUNCTION public.set_updated_at_now()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
COMMENT ON FUNCTION public.set_updated_at_now() IS
  'Generic BEFORE UPDATE trigger to keep updated_at fresh. SECURITY INVOKER + empty search_path per Supabase advisor guidance.';


-- -----------------------------------------------------------------------------
-- Part D — Properties (tenant-scoped saved listings)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.properties (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

  -- Provenance
  source_listing_id           text,                                              -- references listings.id when the property was imported from a scraped listing
  source_url                  text,

  -- Geographic
  city_slug                   text REFERENCES public.cities(slug)        ON DELETE SET NULL,
  neighborhood_id             text REFERENCES public.neighborhoods(id)   ON DELETE SET NULL,
  address                     text,
  location                    geometry(Point, 4326),

  -- Hard facts
  title                       text,
  price_eur                   numeric(12, 2) CHECK (price_eur IS NULL OR price_eur >= 0),
  m2                          numeric(8, 2)  CHECK (m2        IS NULL OR m2        >= 0),
  beds                        smallint       CHECK (beds      IS NULL OR beds      >= 0),
  baths                       smallint       CHECK (baths     IS NULL OR baths     >= 0),
  lift                        boolean,
  energy_cert                 text           CHECK (energy_cert IS NULL OR energy_cert IN ('A','B','C','D','E','F','G')),
  year_built                  smallint,
  year_renovated              smallint,

  -- Computed (snapshotted at import; refresh via job)
  in_zona_tensionada          boolean,
  rent_index_ceiling_eur_m2_mo numeric(10, 2),
  gross_yield_pct_p25         numeric(6, 3),
  gross_yield_pct_p50         numeric(6, 3),
  gross_yield_pct_p75         numeric(6, 3),
  gross_yield_pct_legal_max   numeric(6, 3),

  -- Photos (URLs to images stored in object storage or scraped originals)
  photos                      text[] NOT NULL DEFAULT '{}',

  -- Lifecycle
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  archived_at                 timestamptz                                        -- soft archive
);
COMMENT ON TABLE public.properties IS
  'A tenant''s tracked real-estate unit. Either imported from a public listing (source_listing_id set) or manually entered. Soft-archive via archived_at; rows are never hard-deleted by the app so deals/notes/opportunities keep their history.';

CREATE INDEX IF NOT EXISTS properties_tenant_idx
  ON public.properties(tenant_id)
  WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS properties_tenant_city_idx
  ON public.properties(tenant_id, city_slug);
CREATE INDEX IF NOT EXISTS properties_location_gist
  ON public.properties USING gist(location);

DROP TRIGGER IF EXISTS properties_set_updated_at ON public.properties;
CREATE TRIGGER properties_set_updated_at
  BEFORE UPDATE ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_now();


-- -----------------------------------------------------------------------------
-- Part E — Deals (active pipeline)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.deals (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES public.tenants(id)          ON DELETE CASCADE,
  property_id           uuid NOT NULL REFERENCES public.properties(id)       ON DELETE CASCADE,
  stage_slug            text NOT NULL REFERENCES public.pipeline_stages(slug),

  -- Lifecycle
  opened_at             timestamptz NOT NULL DEFAULT now(),
  last_stage_change_at  timestamptz NOT NULL DEFAULT now(),
  closed_at             timestamptz,
  closed_outcome        text CHECK (closed_outcome IS NULL OR closed_outcome IN (
                          'purchased','withdrawn','outbid','rejected_inspection','other'
                        )),

  -- Negotiation
  current_offer_eur     numeric(12, 2) CHECK (current_offer_eur IS NULL OR current_offer_eur >= 0),
  asking_eur            numeric(12, 2) CHECK (asking_eur        IS NULL OR asking_eur        >= 0),

  -- Agent / contact info
  agency_id             text REFERENCES public.agencies(id) ON DELETE SET NULL,
  agency_contact        text,
  agency_phone          text,

  -- Free-text summary maintained by user/agent
  summary               text,

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.deals IS
  'A property''s position in the buying pipeline. One property may have multiple deals over time (re-engaged after withdrawal). closed_at + closed_outcome capture terminal states.';

CREATE INDEX IF NOT EXISTS deals_tenant_idx        ON public.deals(tenant_id);
CREATE INDEX IF NOT EXISTS deals_tenant_stage_idx  ON public.deals(tenant_id, stage_slug) WHERE closed_at IS NULL;
CREATE INDEX IF NOT EXISTS deals_property_idx      ON public.deals(property_id);

DROP TRIGGER IF EXISTS deals_set_updated_at ON public.deals;
CREATE TRIGGER deals_set_updated_at
  BEFORE UPDATE ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_now();


-- -----------------------------------------------------------------------------
-- Part F — Deal notes + viewing logs
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.deal_notes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES public.tenants(id)          ON DELETE CASCADE,
  deal_id           uuid NOT NULL REFERENCES public.deals(id)            ON DELETE CASCADE,
  body              text NOT NULL,
  author_user_id    uuid REFERENCES auth.users(id)                       ON DELETE SET NULL,
  author_api_key_id uuid REFERENCES public.tenant_api_keys(id)           ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (author_user_id IS NOT NULL OR author_api_key_id IS NOT NULL)
);
COMMENT ON TABLE public.deal_notes IS
  'Append-only timeline of free-text notes on a deal. Author is either a logged-in user or an API key (the agent). At least one must be set.';

CREATE INDEX IF NOT EXISTS deal_notes_deal_idx
  ON public.deal_notes(deal_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.viewing_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  deal_id     uuid NOT NULL REFERENCES public.deals(id)   ON DELETE CASCADE,
  visited_at  timestamptz NOT NULL,
  decision    text CHECK (decision IS NULL OR decision IN ('proceed','revisit','reject')),
  notes       text,
  photos      text[] NOT NULL DEFAULT '{}',
  attendees   text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.viewing_logs IS
  'Records of physical property visits — visited_at, decision (proceed/revisit/reject), photos, and notes. Drives the "visits" tab in the deal detail view.';

CREATE INDEX IF NOT EXISTS viewing_logs_deal_idx
  ON public.viewing_logs(deal_id, visited_at DESC);


-- -----------------------------------------------------------------------------
-- Part G — Opportunities (agent-flagged follow-ups)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.opportunities (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

  -- What kind of opportunity. Used by frontend to render the right icon/copy.
  kind              text NOT NULL CHECK (kind IN (
                      'price_drop',           -- existing watched property dropped price
                      'new_match',            -- new listing matches a saved filter
                      'serpavi_revision',     -- rent index revised — re-yield needed
                      'zona_tensionada',      -- municipality declared/lifted
                      'agency_alert',         -- agency contacted us / followed up
                      'visit_due',            -- scheduled visit upcoming
                      'derrama_signal',       -- community-fees signal in scrape text
                      'hut_granted',          -- HUT license registry update
                      'other'
                    )),
  status            text NOT NULL DEFAULT 'new' CHECK (status IN ('new','seen','acted','dismissed')),

  -- Optional pointers (any may be null)
  property_id       uuid REFERENCES public.properties(id) ON DELETE CASCADE,
  deal_id           uuid REFERENCES public.deals(id)      ON DELETE CASCADE,
  city_slug         text REFERENCES public.cities(slug)   ON DELETE CASCADE,

  -- Severity-coded for UI
  severity          text NOT NULL DEFAULT 'info' CHECK (severity IN ('critical','warning','info')),

  -- Free-text payload + structured detail blob
  title             text NOT NULL,
  body              text,
  detail            jsonb,

  -- Author (may be agent or system)
  source            text NOT NULL DEFAULT 'system',                  -- 'system' | 'agent' | 'user'
  author_api_key_id uuid REFERENCES public.tenant_api_keys(id) ON DELETE SET NULL,

  created_at        timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.opportunities IS
  'Agent- or system-flagged follow-ups (price drops, new matches, SERPAVI revisions, HUT grants, …). Rendered as the "Opportunities" feed in the COP. status transitions: new → seen → acted | dismissed.';

CREATE INDEX IF NOT EXISTS opportunities_tenant_idx
  ON public.opportunities(tenant_id, status, created_at DESC);


-- -----------------------------------------------------------------------------
-- Part H — Agent action audit log
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.agent_actions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES public.tenants(id)         ON DELETE CASCADE,
  api_key_id  uuid REFERENCES public.tenant_api_keys(id)          ON DELETE SET NULL,
  tool        text NOT NULL,                                       -- e.g. 'add_property', 'move_deal_stage'
  input       jsonb NOT NULL,
  output      jsonb,
  status      text NOT NULL CHECK (status IN ('ok','error')),
  error_code  text,
  duration_ms integer,
  created_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.agent_actions IS
  'Append-only audit log of every OpenClaw / agent tool call. tenant + api_key + tool + input/output + status. Tenant members can read; only the service role writes.';

CREATE INDEX IF NOT EXISTS agent_actions_tenant_time_idx
  ON public.agent_actions(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_actions_key_idx
  ON public.agent_actions(api_key_id, created_at DESC);


-- -----------------------------------------------------------------------------
-- Part I — RLS
-- -----------------------------------------------------------------------------
-- Enable RLS on every new table. Backend (using SUPABASE_SERVICE_ROLE_KEY)
-- bypasses RLS automatically. The Brúixola API resolves tenant_id from the
-- Bearer token (either an auth.users JWT or a brx_ tenant_api_keys token)
-- and writes with the service role on the user's behalf. RLS is the
-- defense-in-depth layer for any direct-from-client query.

ALTER TABLE public.tenants         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_users    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.properties      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deals           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_notes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.viewing_logs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opportunities   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_actions   ENABLE ROW LEVEL SECURITY;

-- Pipeline stages: public read (it's a static reference table)
DROP POLICY IF EXISTS "pipeline_stages_public_read" ON public.pipeline_stages;
CREATE POLICY "pipeline_stages_public_read"
  ON public.pipeline_stages FOR SELECT
  TO anon, authenticated
  USING (true);

-- Tenants: users can see tenants they belong to
DROP POLICY IF EXISTS "tenants_member_read" ON public.tenants;
CREATE POLICY "tenants_member_read"
  ON public.tenants FOR SELECT
  TO authenticated
  USING (id IN (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()));

-- Tenant users: can see your own memberships, and other members of tenants you own
DROP POLICY IF EXISTS "tenant_users_own_read" ON public.tenant_users;
CREATE POLICY "tenant_users_own_read"
  ON public.tenant_users FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR tenant_id IN (
      SELECT tenant_id FROM public.tenant_users
      WHERE user_id = auth.uid() AND role = 'owner'
    )
  );

-- API keys: only owners of the tenant can read/write
DROP POLICY IF EXISTS "tenant_api_keys_owner_all" ON public.tenant_api_keys;
CREATE POLICY "tenant_api_keys_owner_all"
  ON public.tenant_api_keys FOR ALL
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users
      WHERE user_id = auth.uid() AND role = 'owner'
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users
      WHERE user_id = auth.uid() AND role = 'owner'
    )
  );

-- Properties: members read; owner+member write
DROP POLICY IF EXISTS "properties_tenant_read"  ON public.properties;
DROP POLICY IF EXISTS "properties_tenant_write" ON public.properties;
CREATE POLICY "properties_tenant_read"
  ON public.properties FOR SELECT
  TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()));
CREATE POLICY "properties_tenant_write"
  ON public.properties FOR ALL
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users
      WHERE user_id = auth.uid() AND role IN ('owner','member')
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users
      WHERE user_id = auth.uid() AND role IN ('owner','member')
    )
  );

-- Deals: members read; owner+member write
DROP POLICY IF EXISTS "deals_tenant_read"  ON public.deals;
DROP POLICY IF EXISTS "deals_tenant_write" ON public.deals;
CREATE POLICY "deals_tenant_read"
  ON public.deals FOR SELECT
  TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()));
CREATE POLICY "deals_tenant_write"
  ON public.deals FOR ALL
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users
      WHERE user_id = auth.uid() AND role IN ('owner','member')
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users
      WHERE user_id = auth.uid() AND role IN ('owner','member')
    )
  );

-- Deal notes: members read; owner+member write
DROP POLICY IF EXISTS "deal_notes_tenant_read"  ON public.deal_notes;
DROP POLICY IF EXISTS "deal_notes_tenant_write" ON public.deal_notes;
CREATE POLICY "deal_notes_tenant_read"
  ON public.deal_notes FOR SELECT
  TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()));
CREATE POLICY "deal_notes_tenant_write"
  ON public.deal_notes FOR ALL
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users
      WHERE user_id = auth.uid() AND role IN ('owner','member')
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users
      WHERE user_id = auth.uid() AND role IN ('owner','member')
    )
  );

-- Viewing logs: members read; owner+member write
DROP POLICY IF EXISTS "viewing_logs_tenant_read"  ON public.viewing_logs;
DROP POLICY IF EXISTS "viewing_logs_tenant_write" ON public.viewing_logs;
CREATE POLICY "viewing_logs_tenant_read"
  ON public.viewing_logs FOR SELECT
  TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()));
CREATE POLICY "viewing_logs_tenant_write"
  ON public.viewing_logs FOR ALL
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users
      WHERE user_id = auth.uid() AND role IN ('owner','member')
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users
      WHERE user_id = auth.uid() AND role IN ('owner','member')
    )
  );

-- Opportunities: members read; owner+member write
DROP POLICY IF EXISTS "opportunities_tenant_read"  ON public.opportunities;
DROP POLICY IF EXISTS "opportunities_tenant_write" ON public.opportunities;
CREATE POLICY "opportunities_tenant_read"
  ON public.opportunities FOR SELECT
  TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()));
CREATE POLICY "opportunities_tenant_write"
  ON public.opportunities FOR ALL
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users
      WHERE user_id = auth.uid() AND role IN ('owner','member')
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users
      WHERE user_id = auth.uid() AND role IN ('owner','member')
    )
  );

-- Agent actions: tenant members can read their own audit log; only the
-- service role writes (no INSERT policy for authenticated).
DROP POLICY IF EXISTS "agent_actions_tenant_read" ON public.agent_actions;
CREATE POLICY "agent_actions_tenant_read"
  ON public.agent_actions FOR SELECT
  TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()));


-- -----------------------------------------------------------------------------
-- Part J — Seed Albert's tenant
-- -----------------------------------------------------------------------------
-- Hand-rolled UUID for stability across migrations and local dev DBs. The API
-- defaults to this tenant when SUPABASE_DEFAULT_TENANT_ID is set (single-tenant
-- mode). tenant_users + tenant_api_keys seeding is deferred until Supabase Auth
-- is wired (we need a real auth.users.id before we can join).

INSERT INTO public.tenants (id, slug, display_name) VALUES
  ('00000000-0000-0000-0000-000000000001', 'albert', 'Albert · Brúixola')
ON CONFLICT (id) DO NOTHING;
