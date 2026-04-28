import clsx from 'clsx';

/**
 * Severity-coded label chips.
 *
 * Filled variants (`critical | warning | info | good`) are the loud
 * "this matters" form — used sparingly. Ghost variants
 * (`ghost-amber | ghost-red | ghost-cyan | ghost-green`) carry the
 * same color semantics at lower visual weight, so a card can stack
 * several of them without becoming a clown car.
 */

export type BadgeVariant =
  | 'critical'
  | 'warning'
  | 'info'
  | 'good'
  | 'ghost-amber'
  | 'ghost-red'
  | 'ghost-cyan'
  | 'ghost-green';

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  critical: 'bg-red text-bg-0 border border-red',
  warning: 'bg-amber text-bg-0 border border-amber',
  info: 'bg-cyan text-bg-0 border border-cyan',
  good: 'bg-green text-bg-0 border border-green',
  'ghost-red': 'bg-red-dim/20 text-red border border-red-dim',
  'ghost-amber': 'bg-amber-dim/20 text-amber border border-amber-dim',
  'ghost-cyan': 'bg-cyan-dim/20 text-cyan border border-cyan-dim',
  'ghost-green': 'bg-green-dim/20 text-green border border-green-dim',
};

export function Badge({
  variant = 'info',
  className,
  children,
}: {
  variant?: BadgeVariant;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-sm font-mono text-[9px] uppercase tracking-[0.14em] leading-none',
        'px-[7px] py-[2px]',
        VARIANT_CLASSES[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
