// Brúixola Agent tools — thin wrappers around the Bruixola API /tools/* RPC
// endpoints. Each tool is a Zod-validated `tool({...})` from the AI SDK; the
// agent loop in apps/web/app/api/chat/route.ts invokes these on demand.
//
// Server-side only. Reads BRUIXOLA_API_BASE + BRUIXOLA_API_TOKEN from env.
// Never logs the token.

import { tool } from 'ai';
import { z } from 'zod';

const API_BASE = process.env.BRUIXOLA_API_BASE ?? 'http://localhost:3001';
const TOKEN = process.env.BRUIXOLA_API_TOKEN ?? '';

// Listings IDs are 12-char lowercase hex (legacy id column in our schema).
const listingIdSchema = z
  .string()
  .regex(/^[0-9a-f]{12}$/, 'listing_id must be 12 lowercase hex chars');

async function call<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`${path} → ${res.status}: ${errBody.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

export const bruixolaTools = {
  search_listings: tool({
    description:
      "Cerca pisos amb filtres estructurats. Retorna fins a 10 resultats. Usar quan l'usuari demani pisos en una ciutat, rang de preu, condició, yield mínim, etc.",
    inputSchema: z.object({
      city: z
        .string()
        .optional()
        .describe('Slug de la ciutat (reus, barcelona, l-hospitalet-de-llobregat, etc.)'),
      max_price_eur: z.number().optional(),
      min_price_eur: z.number().optional(),
      min_beds: z.number().int().optional(),
      max_beds: z.number().int().optional(),
      min_yield_p50_pct: z.number().optional(),
      condition: z
        .enum(['reformado', 'good', 'reform_needed', 'wreck', 'unknown'])
        .optional(),
      in_zona_tensionada: z.boolean().optional(),
      hut_license_required: z.boolean().optional(),
      limit: z.number().int().min(1).max(10).default(5),
    }),
    execute: async (args) => call('/tools/search', args),
  }),

  compute_yield: tool({
    description:
      'Calcula el rang de yield (P25-P50-P75) per a un pis específic. Retorna també el sostre legal SERPAVI si el pis és en zona tensionada.',
    inputSchema: z.object({
      listing_id: listingIdSchema,
    }),
    execute: async (args) => call('/tools/yield-for', args),
  }),

  compare_listings: tool({
    description:
      'Compara 2-5 pisos costat per costat: preu, m², yield, condició, distàncies, zona tensionada.',
    inputSchema: z.object({
      listing_ids: z.array(listingIdSchema).min(2).max(5),
    }),
    execute: async (args) => call('/tools/compare', args),
  }),

  neighborhood_brief: tool({
    description:
      "Mètriques deterministes d'una ciutat o barri: preu mig, yield medià, transit score, indicadors d'hospital/universitat, sostre legal SERPAVI.",
    inputSchema: z.object({
      city: z.string(),
      neighborhood: z.string().optional(),
    }),
    execute: async (args) => call('/tools/neighborhood', args),
  }),

  agencies_in_city: tool({
    description:
      'Agències immobiliàries i gestories verificades en una ciutat catalana. Retorna 3-5 amb telèfon, web i especialitat.',
    inputSchema: z.object({
      city: z.string(),
      specialty: z
        .enum([
          'sales',
          'rentals',
          'commercial',
          'investment',
          'luxury',
          'social_housing',
          'str',
          'auctions',
        ])
        .optional(),
      limit: z.number().int().min(1).max(10).default(5),
    }),
    execute: async (args) => call('/tools/agency-for', args),
  }),
} as const;
