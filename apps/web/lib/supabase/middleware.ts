import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { Database } from './types';

type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * Middleware-side Supabase client. Distinct from `lib/supabase/server.ts`
 * because middleware can't use `next/headers` cookies — it uses
 * `request.cookies` and writes back via `response.cookies`.
 *
 * Two responsibilities:
 *   1. Refresh the Supabase auth cookie if it's stale (the `getUser()` call
 *      triggers a token refresh and the SSR helper writes the new cookies
 *      onto `response`).
 *   2. Gate tenant-scoped routes — redirect anonymous visitors to /login
 *      with a `next` query param so they bounce back after authenticating.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Tenant-scoped routes — redirect anonymous visitors to /login.
  const path = request.nextUrl.pathname;
  const protectedPrefixes = ['/properties', '/deals', '/opportunities', '/settings'];
  if (!user && protectedPrefixes.some((p) => path.startsWith(p))) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', path);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}
