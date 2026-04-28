'use client';

// Brúixola Agent — right-edge collapsible chat panel.
//
// Closed: 40px-wide vertical strip pinned to the right edge below the TopBar.
// Open: 400px-wide panel that slides in from the right.
//
// AI SDK v6 useChat exposes `messages`, `sendMessage`, `status`, `error`,
// `setMessages`, `clearError`, `regenerate`, `stop`. Input is local state.
// Transport is configured via `DefaultChatTransport({ api })`.

import { DefaultChatTransport, type UIMessage } from 'ai';
import { useChat } from '@ai-sdk/react';
import {
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

type Props = {
  /** Initial open/closed state. Defaults to false (closed strip). */
  defaultOpen?: boolean;
};

const EXAMPLE_PROMPTS = [
  'Quin pis té el millor yield a Reus per sota de 200k?',
  'Compara els 2 pisos amb més rendibilitat a Bellvitge',
  'Quines agències hi ha a Tarragona?',
  'Resum del mercat a Camprodon',
];

// Stable transport instance — useChat resubscribes if this changes by reference.
const transport = new DefaultChatTransport({ api: '/api/chat' });

export function ChatPanel({ defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const [input, setInput] = useState('');
  const [keyMissing, setKeyMissing] = useState(false);
  const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>({});
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const { messages, sendMessage, status, error, stop } = useChat({
    transport,
    onError: (err: Error) => {
      // Detect the 503 anthropic_key_missing payload returned by /api/chat
      // when the server has no usable ANTHROPIC_API_KEY. The body is JSON.
      const msg = err?.message ?? '';
      if (msg.includes('anthropic_key_missing') || msg.includes('503')) {
        setKeyMissing(true);
      }
    },
  });

  // Auto-scroll to bottom on new messages or streaming chunks.
  useEffect(() => {
    if (!scrollerRef.current) return;
    scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
  }, [messages, status]);

  // Auto-grow textarea up to 5 rows (~120px).
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = '0px';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
  }, [input]);

  // Focus textarea when the panel opens.
  useEffect(() => {
    if (open && !keyMissing) {
      // small delay to let the slide-in animation start before stealing focus
      const t = setTimeout(() => textareaRef.current?.focus(), 220);
      return () => clearTimeout(t);
    }
  }, [open, keyMissing]);

  const isBusy = status === 'submitted' || status === 'streaming';
  const canSend = input.trim().length > 0 && !isBusy && !keyMissing;

  function submit() {
    const text = input.trim();
    if (!text || isBusy || keyMissing) return;
    setInput('');
    sendMessage({ text });
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    submit();
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  function onChipClick(prompt: string) {
    if (keyMissing || isBusy) return;
    setInput('');
    sendMessage({ text: prompt });
  }

  function toggleTool(id: string) {
    setExpandedTools((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  // ─── Closed strip ───────────────────────────────────────────────────────
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Obre el chat de Brúixola Agent"
        className="fixed top-[38px] right-0 bottom-0 z-40 flex w-[40px] flex-col items-center justify-center gap-3 border-l border-line-1 bg-bg-1 text-ink-2 transition-colors hover:bg-bg-2 hover:text-cyan"
      >
        <ChatIcon />
        <span
          className="font-mono text-[10px] tracking-[0.18em] uppercase whitespace-nowrap"
          style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
        >
          Brúixola · Agent
        </span>
        <StatusDot keyMissing={keyMissing} />
      </button>
    );
  }

  // ─── Open panel ─────────────────────────────────────────────────────────
  return (
    <aside
      aria-label="Brúixola Agent"
      className="fixed top-[38px] right-0 bottom-0 z-40 flex w-[400px] translate-x-0 flex-col border-l border-line-1 bg-bg-0 transition-transform duration-200 ease-out"
      style={{ boxShadow: '-12px 0 24px -12px rgba(0,0,0,0.6)' }}
    >
      {/* Header */}
      <header className="flex h-[52px] shrink-0 items-center justify-between border-b border-line-1 bg-bg-1 px-3">
        <div className="flex items-center gap-2">
          <StatusDot keyMissing={keyMissing} />
          <span className="font-mono text-[11px] tracking-[0.18em] uppercase text-cyan">
            Brúixola · Agent
          </span>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Tanca el chat"
          className="flex h-7 w-7 items-center justify-center text-ink-3 transition-colors hover:text-ink-0"
        >
          <CloseIcon />
        </button>
      </header>

      {/* Body */}
      <div
        ref={scrollerRef}
        className="scrollbar-thin flex-1 overflow-y-auto px-3 py-3"
      >
        {keyMissing ? (
          <KeyMissingNotice />
        ) : messages.length === 0 ? (
          <EmptyState onChip={onChipClick} disabled={isBusy} />
        ) : (
          <ul className="flex flex-col gap-3">
            {messages.map((m) => (
              <MessageBubble
                key={m.id}
                message={m}
                expandedTools={expandedTools}
                onToggleTool={toggleTool}
              />
            ))}
            {isBusy && <PulseDots />}
            {error && !keyMissing && (
              <li className="font-mono text-[11px] tracking-wider uppercase text-red">
                Error: {error.message.slice(0, 200)}
              </li>
            )}
          </ul>
        )}
      </div>

      {/* Footer / input */}
      <form
        onSubmit={onSubmit}
        className="shrink-0 border-t border-line-1 bg-bg-1 px-3 pt-2 pb-3"
      >
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={keyMissing}
            rows={1}
            placeholder={
              keyMissing
                ? 'Agent no configurat'
                : "Pregunta sobre pisos, ciutats, agències…"
            }
            className="scrollbar-thin flex-1 resize-none border border-line-1 bg-bg-0 px-2 py-2 font-sans text-[13px] text-ink-0 placeholder:text-ink-3 focus:border-cyan-dim focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            style={{ minHeight: '36px', maxHeight: '120px' }}
          />
          {isBusy ? (
            <button
              type="button"
              onClick={() => stop()}
              className="h-9 shrink-0 border border-line-2 bg-bg-2 px-3 font-mono text-[11px] tracking-[0.16em] uppercase text-ink-1 transition-colors hover:border-red hover:text-red"
            >
              Atura
            </button>
          ) : (
            <button
              type="submit"
              disabled={!canSend}
              className="h-9 shrink-0 border px-3 font-mono text-[11px] tracking-[0.16em] uppercase transition-colors disabled:cursor-not-allowed"
              style={
                canSend
                  ? {
                      borderColor: 'var(--color-cyan)',
                      backgroundColor: 'var(--color-cyan)',
                      color: 'var(--color-bg-0)',
                    }
                  : {
                      borderColor: 'var(--color-line-2)',
                      backgroundColor: 'var(--color-bg-2)',
                      color: 'var(--color-ink-3)',
                    }
              }
            >
              Envia
            </button>
          )}
        </div>
        <p className="mt-2 font-mono text-[10px] tracking-[0.16em] uppercase text-ink-3">
          Powered by OpenClaw (work-in-progress) · 5 eines disponibles
        </p>
      </form>
    </aside>
  );
}

// ─── Subcomponents ─────────────────────────────────────────────────────────

function StatusDot({ keyMissing }: { keyMissing: boolean }) {
  if (keyMissing) {
    return (
      <span
        aria-label="Agent offline"
        className="inline-block h-2 w-2 rounded-full bg-amber"
        style={{ boxShadow: '0 0 6px rgba(232, 178, 92, 0.6)' }}
      />
    );
  }
  return (
    <span
      aria-label="Agent connectat"
      className="inline-block h-2 w-2 rounded-full bg-green"
      style={{
        boxShadow: '0 0 6px rgba(127, 190, 110, 0.6)',
        animation: 'livePulse 2.4s ease-in-out infinite',
      }}
    />
  );
}

function ChatIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden
    >
      <path d="M4 5h16v11H8l-4 4V5z" strokeLinejoin="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden
    >
      <path d="M5 5l14 14M19 5L5 19" strokeLinecap="round" />
    </svg>
  );
}

function PulseDots() {
  return (
    <li
      className="flex items-center gap-1 px-1 text-cyan"
      aria-label="L'agent està pensant"
    >
      <Dot delay="0s" />
      <Dot delay="0.18s" />
      <Dot delay="0.36s" />
    </li>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="inline-block h-1.5 w-1.5 rounded-full bg-cyan"
      style={{ animation: 'livePulse 1.2s ease-in-out infinite', animationDelay: delay }}
    />
  );
}

function EmptyState({
  onChip,
  disabled,
}: {
  onChip: (prompt: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 px-2 text-center">
      <div className="space-y-1">
        <p className="font-mono text-[11px] tracking-[0.22em] uppercase text-cyan">
          Brúixola · Agent
        </p>
        <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-ink-3">
          Intel·ligència immobiliària per a Catalunya
        </p>
      </div>
      <ul className="flex w-full flex-col gap-2">
        {EXAMPLE_PROMPTS.map((p) => (
          <li key={p}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChip(p)}
              className="w-full border border-line-1 bg-bg-1 px-3 py-2 text-left text-[12px] text-ink-1 transition-colors hover:border-cyan-dim hover:text-ink-0 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {p}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function KeyMissingNotice() {
  return (
    <div className="flex flex-col gap-3 border border-line-1 bg-bg-1 p-4">
      <p className="font-mono text-[11px] tracking-[0.22em] uppercase text-amber">
        Agent no configurat
      </p>
      <p className="text-[12px] text-ink-1">
        Configura{' '}
        <code className="font-mono text-cyan">ANTHROPIC_API_KEY</code> a{' '}
        <code className="font-mono text-cyan">apps/web/.env.local</code> per
        activar l&apos;agent.
      </p>
      <pre className="overflow-x-auto border border-line-1 bg-bg-0 px-3 py-2 font-mono text-[11px] text-ink-1">
        {`# apps/web/.env.local
ANTHROPIC_API_KEY=sk-ant-...`}
      </pre>
      <p className="font-mono text-[10px] tracking-[0.14em] uppercase text-ink-3">
        Reinicia el dev server després d&apos;editar.
      </p>
    </div>
  );
}

function MessageBubble({
  message,
  expandedTools,
  onToggleTool,
}: {
  message: UIMessage;
  expandedTools: Record<string, boolean>;
  onToggleTool: (id: string) => void;
}) {
  if (message.role === 'user') {
    const text = textOf(message);
    return (
      <li className="flex justify-end">
        <div className="max-w-[85%] border border-line-1 bg-bg-3 px-3 py-2 text-[13px] text-ink-0 whitespace-pre-wrap">
          {text}
        </div>
      </li>
    );
  }

  // assistant — render parts in order
  return (
    <li className="flex flex-col gap-1.5">
      {message.parts.map((part, idx) => {
        if (part.type === 'text') {
          return (
            <div
              key={idx}
              className="max-w-[95%] text-[13px] text-ink-1 whitespace-pre-wrap"
            >
              {part.text}
            </div>
          );
        }
        if (part.type === 'reasoning') {
          // Hidden by default — render dim italic in case the model emits it.
          return (
            <div
              key={idx}
              className="max-w-[95%] font-mono text-[10px] tracking-wide text-ink-3 italic"
            >
              {part.text}
            </div>
          );
        }
        if (typeof part.type === 'string' && part.type.startsWith('tool-')) {
          return (
            <ToolPart
              key={idx}
              part={part as ToolPartLike}
              expanded={!!expandedTools[`${message.id}:${idx}`]}
              onToggle={() => onToggleTool(`${message.id}:${idx}`)}
            />
          );
        }
        if (part.type === 'dynamic-tool') {
          return (
            <ToolPart
              key={idx}
              part={part as ToolPartLike}
              expanded={!!expandedTools[`${message.id}:${idx}`]}
              onToggle={() => onToggleTool(`${message.id}:${idx}`)}
            />
          );
        }
        return null;
      })}
    </li>
  );
}

// Loose shape we read off both static `tool-<name>` parts and `dynamic-tool`.
type ToolPartLike = {
  type: string;
  toolName?: string;
  toolCallId?: string;
  state?: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
};

function ToolPart({
  part,
  expanded,
  onToggle,
}: {
  part: ToolPartLike;
  expanded: boolean;
  onToggle: () => void;
}) {
  // Static parts encode the name in the type: "tool-search_listings".
  const name =
    part.toolName ??
    (part.type.startsWith('tool-') ? part.type.slice('tool-'.length) : 'tool');
  const args = formatArgs(part.input);
  const state = part.state ?? 'unknown';
  const isError = state === 'output-error';
  const hasOutput = state === 'output-available';

  return (
    <div className="max-w-[95%]">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start gap-1 text-left font-mono text-[11px] leading-relaxed tracking-wide transition-colors hover:text-cyan-hot"
        style={{ color: isError ? 'var(--color-red)' : 'var(--color-cyan-dim)' }}
      >
        <span aria-hidden>▸</span>
        <span className="flex-1 break-words">
          <span className="text-cyan">{name}</span>
          {args ? <span className="text-ink-3">({args})</span> : null}
          {state === 'input-streaming' || state === 'input-available' ? (
            <span className="ml-2 text-ink-3">…</span>
          ) : null}
          {isError ? <span className="ml-2 text-red">error</span> : null}
        </span>
      </button>
      {expanded && (hasOutput || isError) && (
        <pre className="scrollbar-thin mt-1 max-h-64 overflow-auto border border-line-1 bg-bg-1 px-2 py-1.5 font-mono text-[10px] leading-snug text-ink-2">
          {isError
            ? part.errorText ?? 'error'
            : safeStringify(part.output)}
        </pre>
      )}
    </div>
  );
}

function textOf(message: UIMessage): string {
  return message.parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('');
}

function formatArgs(input: unknown): string {
  if (input == null || typeof input !== 'object') return '';
  const entries = Object.entries(input as Record<string, unknown>)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .slice(0, 4)
    .map(([k, v]) => `${k}=${formatVal(v)}`);
  return entries.join(', ');
}

function formatVal(v: unknown): string {
  if (typeof v === 'string') return v.length > 28 ? v.slice(0, 25) + '…' : v;
  if (Array.isArray(v)) return `[${v.length}]`;
  if (typeof v === 'object') return '{…}';
  return String(v);
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

// Suppress unused-value lint when transport ref is the only consumer of the
// import in tree-shaken builds.
export type { UIMessage };
