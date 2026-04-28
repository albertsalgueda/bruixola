import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const SAFE_NEXT_RE = /^\/[a-zA-Z0-9/_\-?=&%.]*$/;

function safeNext(raw: string | null): string {
  if (!raw) return '/properties';
  if (raw.startsWith('//')) return '/properties';
  if (!SAFE_NEXT_RE.test(raw)) return '/properties';
  return raw;
}

/**
 * Magic-link callback. Supabase redirects the user here with a `code`
 * query param after they click the email link. We exchange the code for
 * a session (which sets the auth cookie via the SSR client), then send
 * them on to `next` (or `/properties` by default).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = safeNext(url.searchParams.get('next'));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(
        `${url.origin}/login?error=auth_exchange_failed`,
      );
    }
  }

  return NextResponse.redirect(`${url.origin}${next}`);
}
