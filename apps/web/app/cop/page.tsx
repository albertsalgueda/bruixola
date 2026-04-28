import { createClient } from '@/lib/supabase/server';
import type { City, Listing } from '@/lib/supabase/types';
import { Cockpit } from '@/components/cop/cockpit';
import { getActivityCount24h } from '@/lib/activity';

// COP — Common Operating Picture.
// Server component. Fetches the top of the live listing feed plus the city
// dictionary, and hands everything to the <Cockpit/> client wrapper which owns
// selection state, the map, and the surrounding panels.
export default async function CopPage() {
  const supabase = await createClient();

  const [listingsRes, citiesRes, countRes, activityCount] = await Promise.all([
    supabase
      .from('listings')
      .select('*')
      .is('removed_at', null)
      .order('first_seen_at', { ascending: false })
      .limit(100),
    supabase
      .from('cities')
      .select('slug, name, in_zona_tensionada, has_hospital, has_university'),
    supabase
      .from('listings')
      .select('id', { count: 'exact', head: true })
      .is('removed_at', null),
    getActivityCount24h(),
  ]);

  const listings = (listingsRes.data ?? []) as Listing[];
  const cities = (citiesRes.data ?? []) as City[];
  const totalLive = countRes.count ?? listings.length;

  return (
    <Cockpit
      listings={listings}
      cities={cities}
      totalLive={totalLive}
      activityCount={activityCount}
    />
  );
}
