// Brúixola Agent tools — public-market data.
//
// Server-side only. The agent runs inside the Next.js /api/chat route handler,
// so each tool just queries Supabase directly via @supabase/supabase-js using
// the public anon key. RLS is in effect; only public-readable rows come back.
//
// Why direct queries (not /tools/* RPC against apps/api):
//   - These are read-only public-market lookups; no need for the API gateway.
//   - The data shape (cities + comarques + price_history) is already covered
//     by the migrations and the cities_for_map / comarques_geojson RPCs.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { tool } from 'ai';
import { z } from 'zod';
import type { Database } from '@/lib/supabase/types';
import { num } from '@/lib/market';

// Lazy singleton — first tool call creates the client, subsequent calls reuse.
let cachedClient: SupabaseClient<Database> | null = null;
function client(): SupabaseClient<Database> {
  if (cachedClient) return cachedClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      'Agent tools require NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY.',
    );
  }
  cachedClient = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedClient;
}

const SUPPORTED_METRICS = ['sale_eur_m2', 'rent_eur_m2_mo', 'rent_index_eur_m2_mo'] as const;
type Metric = (typeof SUPPORTED_METRICS)[number];

export const bruixolaTools = {
  list_cities: tool({
    description:
      "Llista municipis catalans amb filtres opcionals. Retorna nom, comarca, població, flags i última sale_eur_m2 quan en tenim. Usar quan l'usuari demani 'quins municipis ...', 'mostra'm les ciutats amb hospital ...', etc.",
    inputSchema: z.object({
      in_zona_tensionada: z.boolean().optional(),
      comarca: z.string().optional().describe('slug de la comarca'),
      has_hospital: z.boolean().optional(),
      has_university: z.boolean().optional(),
      limit: z.number().int().min(1).max(50).default(15),
    }),
    execute: async (args) => {
      const sb = client();
      let q = sb
        .from('cities')
        .select(
          'slug, name, comarca_slug, population, in_zona_tensionada, has_hospital, has_university, transit_score, hut_moratorium_status',
        )
        .order('population', { ascending: false, nullsFirst: false })
        .limit(args.limit);
      if (args.in_zona_tensionada != null)
        q = q.eq('in_zona_tensionada', args.in_zona_tensionada);
      if (args.comarca) q = q.eq('comarca_slug', args.comarca);
      if (args.has_hospital != null) q = q.eq('has_hospital', args.has_hospital);
      if (args.has_university != null)
        q = q.eq('has_university', args.has_university);
      const { data, error } = await q;
      if (error) throw new Error(`list_cities: ${error.message}`);
      return { count: data?.length ?? 0, cities: data ?? [] };
    },
  }),

  get_city: tool({
    description:
      'Detall complet d&apos;un municipi: població, flags, sostre SERPAVI quan és tensionada, mitjana de preus.',
    inputSchema: z.object({
      slug: z.string(),
    }),
    execute: async ({ slug }) => {
      const sb = client();
      const { data, error } = await sb
        .from('cities')
        .select(
          'slug, name, name_es, comarca_slug, province, population, in_zona_tensionada, has_hospital, has_university, transit_score, hut_moratorium_status, rent_index_eur_m2_mo, avg_sale_eur_m2, avg_rent_eur_m2_mo',
        )
        .eq('slug', slug)
        .maybeSingle();
      if (error) throw new Error(`get_city: ${error.message}`);
      return data ?? { not_found: slug };
    },
  }),

  get_comarca: tool({
    description:
      'Detall d&apos;una comarca: població, província i nombre de municipis associats.',
    inputSchema: z.object({
      slug: z.string(),
    }),
    execute: async ({ slug }) => {
      const sb = client();
      const [{ data: comarca, error: e1 }, { count, error: e2 }] = await Promise.all([
        sb
          .from('comarques')
          .select('slug, name, province, population, in_zona_tensionada')
          .eq('slug', slug)
          .maybeSingle(),
        sb
          .from('cities')
          .select('slug', { count: 'exact', head: true })
          .eq('comarca_slug', slug),
      ]);
      if (e1) throw new Error(`get_comarca: ${e1.message}`);
      if (e2) throw new Error(`get_comarca/cities: ${e2.message}`);
      if (!comarca) return { not_found: slug };
      return { ...comarca, member_cities_count: count ?? 0 };
    },
  }),

  get_price_history: tool({
    description:
      "Retorna la sèrie mensual de preus (sale €/m², lloguer €/m²/mes, sostre SERPAVI) per a un municipi. Útil quan l'usuari demana 'evolució', 'històric', 'sèrie temporal' o un mes concret.",
    inputSchema: z.object({
      scope_kind: z.enum(['city']).default('city'),
      scope_id: z.string(),
      months: z
        .number()
        .int()
        .min(1)
        .max(64)
        .default(64)
        .describe('Nombre de mesos més recents a retornar.'),
    }),
    execute: async ({ scope_id, months }) => {
      const sb = client();
      const { data, error } = await sb
        .from('price_history')
        .select('month, sale_eur_m2, rent_eur_m2_mo, rent_index_eur_m2_mo')
        .eq('scope_kind', 'city')
        .eq('scope_id', scope_id)
        .order('month', { ascending: false })
        .limit(months);
      if (error) throw new Error(`get_price_history: ${error.message}`);
      // Sort ascending for the model — easier to read trends top-to-bottom.
      const points = (data ?? [])
        .map((r) => ({
          month: r.month,
          sale_eur_m2: num(r.sale_eur_m2),
          rent_eur_m2_mo: num(r.rent_eur_m2_mo),
          rent_index_eur_m2_mo: num(r.rent_index_eur_m2_mo),
        }))
        .reverse();
      return { scope_id, count: points.length, points };
    },
  }),

  compare_cities: tool({
    description:
      "Compara una mètrica de preus entre 2-5 municipis. La mètrica pot ser 'sale_eur_m2' (preu venda), 'rent_eur_m2_mo' (lloguer real) o 'rent_index_eur_m2_mo' (sostre SERPAVI). Retorna sèries paral·leles.",
    inputSchema: z.object({
      slugs: z.array(z.string()).min(2).max(5),
      metric: z.enum(SUPPORTED_METRICS).default('sale_eur_m2'),
      months: z.number().int().min(1).max(64).default(24),
    }),
    execute: async ({ slugs, metric, months }) => {
      const sb = client();
      const series: Record<string, { month: string; value: number | null }[]> = {};
      // 5 sequential queries max — keeps the surface simple, well within budget.
      for (const slug of slugs) {
        const col: Metric = metric;
        const { data, error } = await sb
          .from('price_history')
          .select(`month, ${col}`)
          .eq('scope_kind', 'city')
          .eq('scope_id', slug)
          .order('month', { ascending: false })
          .limit(months);
        if (error) throw new Error(`compare_cities/${slug}: ${error.message}`);
        series[slug] = (data ?? [])
          .map((r) => ({
            month: r.month,
            value: num((r as Record<string, unknown>)[col]),
          }))
          .reverse();
      }
      return { metric, months, series };
    },
  }),
} as const;
