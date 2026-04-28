// apps/api/src/server.ts
//
// Brúixola API — Hono on Bun, backed by Supabase Postgres.
//
// Routes:
//   GET  /health                         public
//   GET  /listings                       auth — Supabase-backed
//   GET  /listings/:id                   auth — Supabase-backed
//   GET  /cities                         auth — Supabase-backed
//   GET  /strategies                     auth — Supabase-backed
//   GET  /agencies?city=<slug>           auth — Supabase-backed
//   POST /tools/search                   auth — RPC
//   POST /tools/yield-for                auth — RPC
//   POST /tools/compare                  auth — RPC
//   POST /tools/neighborhood             auth — RPC
//   POST /tools/agency-for               auth — RPC
//
// Auth: bearer token in Authorization header. Token is BRUIXOLA_API_TOKEN env.
// CORS: locked to CORS_ORIGIN env (comma-separated).

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import { authBearer } from './middleware/auth.ts';
import { errorHandler } from './errors.ts';
import { listingsRoutes } from './routes/listings.ts';
import { toolsRoutes } from './routes/tools.ts';
import { resolve } from 'node:path';

const app = new Hono();

app.use('*', logger());
app.use('*', secureHeaders());

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

// Public health check.
app.get('/health', (c) =>
  c.json({
    ok: true,
    service: 'bruixola-api',
    version: '0.1.0',
    db: process.env.SUPABASE_URL ? 'supabase' : 'unconfigured',
    ts: new Date().toISOString(),
  }),
);

// Dev-only: serve the HTML mockups from design/ so they can fetch the API
// same-origin (browsers block file:// → http:// cross-origin fetches).
// In production this is gated by NODE_ENV. Public routes — no auth on /dev/*.
if (process.env.NODE_ENV !== 'production') {
  const designDir = resolve(import.meta.dir, '../../../design');
  app.get('/dev', (c) => c.redirect('/dev/cop'));
  app.get('/dev/cop', async (c) => {
    const file = Bun.file(`${designDir}/bruixola-cop.html`);
    return new Response(file, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  });
  // Pass-through for any other design/ static asset (CSS, JSX, etc.)
  app.get('/dev/:filename', async (c) => {
    const filename = c.req.param('filename');
    if (!/^[a-zA-Z0-9._-]+$/.test(filename)) return c.notFound();
    const file = Bun.file(`${designDir}/${filename}`);
    if (!(await file.exists())) return c.notFound();
    return new Response(file);
  });
}

// Auth wall.
app.use('/listings/*', authBearer);
app.use('/listings', authBearer);
app.use('/cities/*', authBearer);
app.use('/cities', authBearer);
app.use('/neighborhoods/*', authBearer);
app.use('/agencies/*', authBearer);
app.use('/agencies', authBearer);
app.use('/strategies/*', authBearer);
app.use('/strategies', authBearer);
app.use('/tools/*', authBearer);

// Mount real handlers.
app.route('/', listingsRoutes);
app.route('/', toolsRoutes);

// Error handler + 404.
app.onError(errorHandler);
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
