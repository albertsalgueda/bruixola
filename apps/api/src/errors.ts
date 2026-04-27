// apps/api/src/errors.ts
//
// Error code taxonomy — autoplan critical item #8 (skeleton).
//
// Every error response from the API uses this shape:
//
//   {
//     "error": {
//       "code": "invalid_city",
//       "message": "City 'Rues' not found. Did you mean 'Reus'?",
//       "suggestions": ["Reus", "Roses", "Rubí"],
//       "docs": "https://bruixola.cat/docs/api#cities"
//     }
//   }
//
// LLM agents (OpenClaw) need structured codes to recover. Humans get the message.
// Per-tool error responses extend this with an optional `suggestions` array.

import type { ErrorHandler } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

export type BruixolaErrorCode =
  // Input shape
  | 'invalid_input'
  | 'invalid_city'
  | 'invalid_filter'
  | 'invalid_listing_id'
  // Domain semantics
  | 'no_listings_found'
  | 'yield_uncomputable'
  | 'comp_set_too_small'
  | 'data_stale'
  | 'zona_tensionada_unknown'
  // System
  | 'rate_limited'
  | 'auth_required'
  | 'tool_disabled'
  | 'not_found'
  | 'internal_error';

export interface BruixolaErrorBody {
  code: BruixolaErrorCode;
  message: string;
  suggestions?: string[];
  docs?: string;
}

export class BruixolaError extends Error {
  override readonly name = 'BruixolaError';
  readonly code: BruixolaErrorCode;
  readonly statusCode: ContentfulStatusCode;
  readonly suggestions?: string[];
  readonly docs?: string;

  constructor(
    code: BruixolaErrorCode,
    message: string,
    statusCode: ContentfulStatusCode = 400,
    extra: { suggestions?: string[]; docs?: string } = {},
  ) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    if (extra.suggestions !== undefined) this.suggestions = extra.suggestions;
    if (extra.docs !== undefined) this.docs = extra.docs;
  }

  toBody(): { error: BruixolaErrorBody } {
    const body: BruixolaErrorBody = { code: this.code, message: this.message };
    if (this.suggestions) body.suggestions = this.suggestions;
    if (this.docs) body.docs = this.docs;
    return { error: body };
  }
}

export const errorHandler: ErrorHandler = (err, c) => {
  if (err instanceof BruixolaError) {
    return c.json(err.toBody(), err.statusCode);
  }
  // Anything unhandled becomes a structured 500 — never leak stack traces.
  console.error('[unhandled]', err);
  return c.json(
    {
      error: {
        code: 'internal_error' satisfies BruixolaErrorCode,
        message: 'An unexpected error occurred.',
        docs: 'https://bruixola.cat/docs/api#errors',
      } satisfies BruixolaErrorBody,
    },
    500,
  );
};
