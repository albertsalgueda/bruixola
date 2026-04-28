-- =============================================================================
-- Migration 012 — Auth helpers + tenant claim trigger + API-key minting
-- =============================================================================
-- Enables real Supabase Auth on Brúixola:
--   * Trigger on auth.users INSERT auto-links the new user to a tenant.
--     The very first user goes to Albert's tenant (id 00000000-...-001) as
--     'owner'. Subsequent users each get their own freshly-created tenant.
--   * mint_api_key RPC issues a brx_<random> token, hashes via SHA-256, and
--     returns the plaintext ONCE (the user must copy it).
--   * revoke_api_key RPC soft-revokes by id.
-- =============================================================================

-- pgcrypto already enabled by Supabase default (gen_random_bytes, digest).
-- Function to claim a tenant for a freshly-created auth.users row.
CREATE OR REPLACE FUNCTION public.handle_new_user_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  -- First user (no tenant_users rows yet) joins Albert's tenant.
  IF NOT EXISTS (SELECT 1 FROM public.tenant_users) THEN
    v_tenant_id := '00000000-0000-0000-0000-000000000001'::uuid;
  ELSE
    -- Create a new tenant for this user.
    INSERT INTO public.tenants (slug, display_name) VALUES (
      'user-' || substring(NEW.id::text, 1, 8),
      coalesce(NEW.raw_user_meta_data->>'full_name', NEW.email, 'Tenant ' || substring(NEW.id::text, 1, 6))
    )
    RETURNING id INTO v_tenant_id;
  END IF;

  INSERT INTO public.tenant_users (tenant_id, user_id, role)
  VALUES (v_tenant_id, NEW.id, 'owner')
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_tenant();


-- mint_api_key — issue a brx_<random> token for an agent.
-- Only callable by tenant owners (verified via auth.uid() lookup).
-- Returns { id, token }. The token is only ever shown once.
CREATE OR REPLACE FUNCTION public.mint_api_key(
  p_tenant_id uuid,
  p_label text,
  p_scopes text[] DEFAULT ARRAY['tools:read','tools:write']
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_token text;
  v_hash text;
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tenant_users
    WHERE tenant_id = p_tenant_id
      AND user_id = auth.uid()
      AND role = 'owner'
  ) THEN
    RAISE EXCEPTION 'only tenant owners can mint API keys';
  END IF;

  IF p_label IS NULL OR length(trim(p_label)) = 0 THEN
    RAISE EXCEPTION 'label is required';
  END IF;

  v_token := 'brx_' || encode(gen_random_bytes(32), 'hex');
  v_hash  := encode(digest(v_token, 'sha256'), 'hex');

  INSERT INTO public.tenant_api_keys (tenant_id, label, token_hash, scopes)
  VALUES (p_tenant_id, trim(p_label), v_hash, p_scopes)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('id', v_id, 'token', v_token, 'label', trim(p_label));
END;
$$;

GRANT EXECUTE ON FUNCTION public.mint_api_key(uuid, text, text[]) TO authenticated;


-- revoke_api_key — soft-revoke (set revoked_at).
CREATE OR REPLACE FUNCTION public.revoke_api_key(p_key_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  UPDATE public.tenant_api_keys
  SET revoked_at = now()
  WHERE id = p_key_id
    AND revoked_at IS NULL
    AND tenant_id IN (
      SELECT tenant_id FROM public.tenant_users
      WHERE user_id = auth.uid() AND role = 'owner'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.revoke_api_key(uuid) TO authenticated;


-- get_my_tenant — convenience: returns the (first) tenant_id for auth.uid().
-- Used by server components to resolve the current tenant in single-tenant mode.
CREATE OR REPLACE FUNCTION public.get_my_tenant()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT tenant_id FROM public.tenant_users
  WHERE user_id = auth.uid()
  ORDER BY created_at ASC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_tenant() TO authenticated;
