// apps/api/src/middleware/auth.ts
//
// Bearer-token auth — autoplan Phase 3 critical item #2.
//
// Reads BRUIXOLA_API_TOKEN from env at startup. Compares using a constant-time
// equality check (defends against timing-based token discovery). Replies with
// the structured error taxonomy on failure.
//
// Usage:
//   app.use('/tools/*', authBearer);

import type { MiddlewareHandler } from 'hono';

const TOKEN = process.env.BRUIXOLA_API_TOKEN ?? '';

if (!TOKEN || TOKEN === 'replace-with-32-byte-hex-token') {
  // Crash fast in production. Dev bootstrap.sh generates a real token on first run.
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'BRUIXOLA_API_TOKEN is missing or still set to the .env.example placeholder. ' +
        'Generate one with `openssl rand -hex 32` and set it via `fly secrets set`.',
    );
  } else {
    // Dev: warn, but allow the server to boot so health check works.
    // eslint-disable-next-line no-console
    console.warn(
      '[auth] WARNING: BRUIXOLA_API_TOKEN missing or placeholder. Authenticated routes will reject all requests.',
    );
  }
}

function constantTimeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export const authBearer: MiddlewareHandler = async (c, next) => {
  const header = c.req.header('Authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header);

  if (!match) {
    return c.json(
      {
        error: {
          code: 'auth_required',
          message: 'Missing Authorization header. Send "Authorization: Bearer <token>".',
          docs: 'https://bruixola.cat/docs/api#auth',
        },
      },
      401,
    );
  }

  const presented = match[1] ?? '';
  if (!TOKEN || !constantTimeEq(presented, TOKEN)) {
    return c.json(
      {
        error: {
          code: 'auth_required',
          message: 'Invalid bearer token.',
          docs: 'https://bruixola.cat/docs/api#auth',
        },
      },
      401,
    );
  }

  await next();
};
