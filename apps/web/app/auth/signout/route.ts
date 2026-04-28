import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * POST-only signout. Clears the Supabase auth cookie and bounces the
 * user to /cop (the public landing). 303 forces the browser to follow
 * with GET, which is the right thing after a form-POST.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(`${new URL(request.url).origin}/cop`, {
    status: 303,
  });
}
