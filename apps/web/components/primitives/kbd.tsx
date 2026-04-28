import clsx from 'clsx';

/**
 * Keyboard-cap pill. Used inline in the search field and tooltips to hint
 * at shortcuts. Visual: bg-1 chip, line-2 border, mono 9px text.
 */
export function Kbd({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-[3px] border border-line-2 bg-bg-1 font-mono text-[9px] uppercase tracking-[0.08em] text-ink-2',
        'px-[5px] py-[1px] leading-none',
        className,
      )}
    >
      {children}
    </span>
  );
}
