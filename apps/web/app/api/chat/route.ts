// POST /api/chat
//
// Brúixola Agent endpoint. Streams a Claude conversation back to the chat
// panel via the AI SDK v6 UI message stream protocol. The agent has tool
// access to the Bruixola API (see ../../../lib/agent/tools.ts).
//
// Auth model: this endpoint trusts same-origin browser callers. The
// expensive secret (ANTHROPIC_API_KEY) and the Bruixola API bearer token
// (BRUIXOLA_API_TOKEN) are server-side only and never reach the browser.
//
// Runtime: Node (not Edge). The Anthropic provider relies on Node fetch
// features and we do not want Edge restrictions on tool-call latency.

import { anthropic } from '@ai-sdk/anthropic';
import {
  streamText,
  convertToModelMessages,
  stepCountIs,
  type UIMessage,
} from 'ai';
import { bruixolaTools } from '@/lib/agent/tools';
import { BRUIXOLA_AGENT_SYSTEM_PROMPT } from '@/lib/agent/system-prompt';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === 'sk-ant-replace') {
    return new Response(
      JSON.stringify({
        error: {
          code: 'anthropic_key_missing',
          message:
            "Configura ANTHROPIC_API_KEY a apps/web/.env.local per activar l'agent.",
        },
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  const { messages }: { messages: UIMessage[] } = await req.json();

  // AI SDK v6: convertToModelMessages is async (it may resolve file URLs).
  const modelMessages = await convertToModelMessages(messages);

  const result = streamText({
    model: anthropic('claude-sonnet-4-5-20250929'),
    system: BRUIXOLA_AGENT_SYSTEM_PROMPT,
    messages: modelMessages,
    tools: bruixolaTools,
    // Safety bound on tool-use loops — agent gets at most 8 steps.
    stopWhen: stepCountIs(8),
    temperature: 0.2,
  });

  return result.toUIMessageStreamResponse();
}
