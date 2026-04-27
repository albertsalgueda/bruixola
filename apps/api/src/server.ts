// apps/api/src/server.ts
//
// Brúixola API — Hono on Bun.
// Real-estate intelligence platform for Catalonia.
//
// Routes:
//   GET  /health         — public health check
//   GET  /listings       — REST browse (auth required)
//   GET  /listings/:id   — REST detail (auth required)
//   POST /tools/search   — RPC for OpenClaw agent (auth required)
//   POST /tools/yield-for, /tools/compare, /tools/neighborhood, /tools/agency-for
//
// Auth: bearer token in Authorization header. Token is BRUIXOLA_API_TOKEN env.
// CORS: locked to CORS_ORIGIN env (comma-separated).

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import { authBearer } from './middleware/auth.ts';
import { errorHandler } from './errors.ts';

const app = new Hono();

// Logging — single line per request.
app.use('*', logger());

// Security headers (no inline scripts on the API surface itself).
app.use('*', secureHeaders());

// CORS — locked to allowed origins. Use * only in dev.
const corsOrigin = process.env.CORS_ORIGIN ?? '*';
app.use(
  '*',
  cors({
    origin: corsOrigin === '*' ? '*' : corsOrigin.split(',').map((s) => s.trim()),
    credentials: false,
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Authorization', 'Content-Type'],
    maxAge: 600,
  }),
);

// Public health check — no auth.
app.get('/health', (c) =>
  c.json({
    ok: true,
    service: 'bruixola-api',
    version: '0.1.0',
    ts: new Date().toISOString(),
  }),
);

// Auth wall: everything below this line requires a bearer token.
app.use('/listings/*', authBearer);
app.use('/listings', authBearer);
app.use('/cities/*', authBearer);
app.use('/cities', authBearer);
app.use('/neighborhoods/*', authBearer);
app.use('/agencies/*', authBearer);
app.use('/strategies/*', authBearer);
app.use('/tools/*', authBearer);

// REST stubs — replaced by real handlers in packages/shared/routes/* in later waves.
app.get('/listings', (c) =>
  c.json(
    {
      items: [],
      cursor: null,
      total: 0,
      note: 'Wave 4 not implemented yet — DuckDB-backed handler lands then.',
    },
    501,
  ),
);

// Tool stubs — same shape, agent-friendly errors.
app.post('/tools/search', (c) =>
  c.json(
    {
      error: {
        code: 'tool_disabled',
        message: 'search_listings is not yet wired up. Wave 4 enables this.',
        docs: 'https://bruixola.cat/docs/api#tools-search',
      },
    },
    501,
  ),
);

// Catch-all error handler — emits the structured taxonomy from errors.ts.
app.onError(errorHandler);

// 404 — also taxonomy-shaped.
app.notFound((c) =>
  c.json(
    {
      error: {
        code: 'not_found',
        message: `Route ${c.req.method} ${c.req.path} does not exist.`,
        docs: 'https://bruixola.cat/docs/api',
      },
    },
    404,
  ),
);

export default {
  port: Number.parseInt(process.env.PORT ?? '3001', 10),
  fetch: app.fetch,
};
