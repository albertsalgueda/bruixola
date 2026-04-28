import Link from 'next/link';
import type { Route } from 'next';
import { requireTenant } from '@/lib/auth/tenant';
import { createClient } from '@/lib/supabase/server';
import { TopBar } from '@/components/chrome/top-bar';
import { Badge, type BadgeVariant } from '@/components/primitives/badge';
import { formatDateRel } from '@/lib/format';
import { t } from '@/lib/i18n';
import type {
  Opportunity,
  OpportunitySeverity,
  OpportunityStatus,
} from '@/lib/tenant-types';
import { setOpportunityStatus } from './actions';

/**
 * `/opportunities` — agent-curated feed of "things worth a human glance."
 *
 * The data model treats every event the same shape — a `kind` enum + a free
 * `body`/`detail` payload + `severity` + `status` workflow. So this view is
 * just one card list with filter chips, not a per-kind dashboard. Filters
 * round-trip through `?status=…` so URLs are linkable; the chip strip below
 * the header is the single source of filter state (no JS).
 */

type SearchParams = { status?: string };

const STATUSES: { slug: OpportunityStatus | 'all'; label: string }[] = [
  { slug: 'all', label: 'Totes' },
  { slug: 'new', label: 'Noves' },
  { slug: 'seen', label: 'Vistes' },
  { slug: 'acted', label: 'Actuades' },
  { slug: 'dismissed', label: 'Descartades' },
];

const SEVERITY_VARIANT: Record<OpportunitySeverity, BadgeVariant> = {
  critical: 'critical',
  warning: 'warning',
  info: 'info',
};

const SEVERITY_DOT: Record<OpportunitySeverity, string> = {
  critical: 'bg-red',
  warning: 'bg-amber',
  info: 'bg-cyan',
};

const STATUS_VARIANT: Record<OpportunityStatus, BadgeVariant> = {
  new: 'info',
  seen: 'warning',
  acted: 'good',
  dismissed: 'ghost-amber',
};

function isStatus(s: string): s is OpportunityStatus {
  return s === 'new' || s === 'seen' || s === 'acted' || s === 'dismissed';
}

export default async function OpportunitiesPage({
  searchParams,
}: {
  // Next 15: searchParams is a Promise.
  searchParams: Promise<SearchParams>;
}) {
  const { tenantId } = await requireTenant('/opportunities');
  const sp = await searchParams;
  const filter: OpportunityStatus | 'all' =
    sp.status && isStatus(sp.status) ? sp.status : 'all';

  const supabase = await createClient();
  let query = supabase
    .from('opportunities')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });
  if (filter !== 'all') {
    query = query.eq('status', filter);
  }
  const { data } = await query;
  const opps = (data ?? []) as Opportunity[];

  return (
    <div className="flex min-h-screen flex-col bg-bg-0 text-ink-1">
      <TopBar />

      <main className="mx-auto w-full max-w-[920px] px-6 py-8">
        <header className="mb-6">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-cyan">
            OPORTUNITATS
          </div>
          <h1 className="mt-2 font-display text-[26px] font-medium leading-tight tracking-tight text-ink-0">
            Feed d&apos;oportunitats
          </h1>
          <p className="mt-2 text-[12px] text-ink-2">
            Senyals que el teu agent ha marcat per a revisió humana.
          </p>
        </header>

        <FilterChips active={filter} />

        {opps.length === 0 ? (
          <EmptyState filter={filter} />
        ) : (
          <ul className="mt-4 space-y-2">
            {opps.map((o) => (
              <OpportunityCard key={o.id} opportunity={o} />
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

function FilterChips({ active }: { active: OpportunityStatus | 'all' }) {
  return (
    <nav
      aria-label="Filtre per estat"
      className="flex flex-wrap items-center gap-2"
    >
      {STATUSES.map(({ slug, label }) => {
        const isActive = active === slug;
        const href: Route = (
          slug === 'all' ? '/opportunities' : `/opportunities?status=${slug}`
        ) as Route;
        return (
          <Link
            key={slug}
            href={href}
            className={`border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] ${
              isActive
                ? 'border-cyan bg-cyan/15 text-cyan'
                : 'border-line-2 text-ink-2 hover:border-cyan-dim hover:text-ink-0'
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function EmptyState({ filter }: { filter: OpportunityStatus | 'all' }) {
  const msg =
    filter === 'all'
      ? 'Encara no hi ha cap oportunitat. El teu agent les anirà afegint automàticament.'
      : 'Cap oportunitat en aquest estat.';
  return (
    <div className="mt-6 rounded-sm border border-dashed border-line-2 bg-bg-1 px-6 py-10 text-center">
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-cyan">
        Sense oportunitats
      </div>
      <p className="mx-auto mt-3 max-w-[480px] text-[13px] leading-[1.55] text-ink-2">
        {msg}
      </p>
    </div>
  );
}

function OpportunityCard({
  opportunity: o,
}: {
  opportunity: Opportunity;
}) {
  return (
    <li className="rounded-sm border border-line-1 bg-bg-1 px-4 py-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className={`inline-block h-2 w-2 rounded-full ${SEVERITY_DOT[o.severity]}`}
            />
            <Badge variant={SEVERITY_VARIANT[o.severity]}>
              {t(o.kind, 'opportunity_kind')}
            </Badge>
            <Badge variant={STATUS_VARIANT[o.status]}>
              {t(o.status, 'opportunity_status').toUpperCase()}
            </Badge>
          </div>

          <h2 className="mt-2 text-[13px] font-medium text-ink-0">
            {o.title}
          </h2>
          {o.body ? (
            <p className="mt-1 line-clamp-2 text-[12px] text-ink-2">
              {o.body}
            </p>
          ) : null}

          <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-ink-3">
            <span className="font-mono uppercase tracking-[0.16em]">
              {formatDateRel(o.created_at)}
            </span>
            {o.source ? (
              <span className="font-mono uppercase tracking-[0.16em]">
                · {o.source}
              </span>
            ) : null}
            {o.property_id ? (
              <Link
                href={`/properties/${o.property_id}` as Route}
                className="rounded-sm border border-line-2 px-2 py-0.5 font-mono uppercase tracking-[0.16em] text-cyan hover:border-cyan-dim"
              >
                Propietat
              </Link>
            ) : null}
            {o.deal_id ? (
              <Link
                href={'/deals' as Route}
                className="rounded-sm border border-line-2 px-2 py-0.5 font-mono uppercase tracking-[0.16em] text-cyan hover:border-cyan-dim"
              >
                Deal
              </Link>
            ) : null}
            {o.city_slug ? (
              <Link
                href={`/cop?city=${o.city_slug}` as Route}
                className="rounded-sm border border-line-2 px-2 py-0.5 font-mono uppercase tracking-[0.16em] text-cyan hover:border-cyan-dim"
              >
                {o.city_slug}
              </Link>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-stretch gap-1">
          <StatusButton id={o.id} target="seen" disabled={o.status === 'seen'}>
            Marcar com vista
          </StatusButton>
          <StatusButton
            id={o.id}
            target="acted"
            disabled={o.status === 'acted'}
            tone="good"
          >
            Marcar com actuada
          </StatusButton>
          <StatusButton
            id={o.id}
            target="dismissed"
            disabled={o.status === 'dismissed'}
            tone="dim"
          >
            Descartar
          </StatusButton>
        </div>
      </div>
    </li>
  );
}

function StatusButton({
  id,
  target,
  disabled,
  tone = 'default',
  children,
}: {
  id: string;
  target: OpportunityStatus;
  disabled?: boolean;
  tone?: 'default' | 'good' | 'dim';
  children: React.ReactNode;
}) {
  const cls =
    tone === 'good'
      ? 'border-green-dim text-green hover:border-green'
      : tone === 'dim'
        ? 'border-line-2 text-ink-3 hover:border-amber-dim hover:text-amber'
        : 'border-line-2 text-ink-2 hover:border-cyan-dim hover:text-cyan';
  return (
    <form action={setOpportunityStatus}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={target} />
      <button
        type="submit"
        disabled={disabled}
        className={`w-full border px-2 py-1 text-left font-mono text-[10px] uppercase tracking-[0.14em] disabled:cursor-not-allowed disabled:opacity-40 ${cls}`}
      >
        {children}
      </button>
    </form>
  );
}
