// apps/api/src/db.ts
//
// Brúixola backend Supabase client.
//
// Reads SUPABASE_URL + SUPABASE_PUBLISHABLE_KEY (or falls back to
// SUPABASE_ANON_KEY for legacy compat). Service role key is NOT used here —
// backend reads are RLS-protected and the listings table allows public
// SELECT on live rows. When per-user write tables ship in a later wave,
// privileged operations will use SUPABASE_SERVICE_ROLE_KEY via a separate
// admin client.
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;

if (!url) throw new Error('SUPABASE_URL is missing. Set it in .env or via fly secrets.');
if (!key) throw new Error('SUPABASE_PUBLISHABLE_KEY is missing. Set it in .env (or service role for backend-only).');

export const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { headers: { 'x-bruixola-component': 'api' } },
});
