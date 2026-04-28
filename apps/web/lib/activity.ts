import { createClient } from '@/lib/supabase/server';

/**
 * Count of listings whose `first_seen_at` is within the last 24 hours.
 *
 * Used by the TopBar Activitat tab badge and by the `/activity` page header.
 * Cached at the page level via Next.js's RSC fetch dedup — each page calls
 * this once per request and the Supabase client is already memoised.
 */
export async function getActivityCount24h(): Promise<number> {
  const supabase = await createClient();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from('listings')
    .select('id', { count: 'exact', head: true })
    .is('removed_at', null)
    .gte('first_seen_at', since);
  return count ?? 0;
}

/**
 * Count of every active (non-removed) listing — the GLOBAL inventory.
 *
 * The status strip at the top of every page shows this number so the user
 * always knows how many listings the platform is tracking, regardless of
 * whichever filtered view (page-specific resultset, strategy, pipeline
 * bucket) they happen to be looking at.
 */
export async function getActiveListingsCount(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from('listings')
    .select('id', { count: 'exact', head: true })
    .is('removed_at', null);
  return count ?? 0;
}
