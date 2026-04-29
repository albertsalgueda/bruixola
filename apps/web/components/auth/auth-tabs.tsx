'use client';

import { useState } from 'react';
import clsx from 'clsx';
import { MagicLinkForm } from '@/components/auth/magic-link-form';
import { PasswordForm } from '@/components/auth/password-form';

type Tab = 'magic' | 'password';

/**
 * Login tabs — magic link vs password. Both flows share the same target
 * (`next`); the user picks whichever they prefer. Default is magic link
 * (zero-friction, the original flow).
 */
export function AuthTabs({ next }: { next: string }) {
  const [tab, setTab] = useState<Tab>('magic');

  return (
    <div className="space-y-6">
      <div
        role="tablist"
        aria-label="Mètode d'entrada"
        className="grid grid-cols-2 border border-line-1 bg-bg-1"
      >
        <TabButton
          active={tab === 'magic'}
          onClick={() => setTab('magic')}
          label="Enllaç màgic"
        />
        <TabButton
          active={tab === 'password'}
          onClick={() => setTab('password')}
          label="Contrasenya"
        />
      </div>

      {tab === 'magic' ? (
        <MagicLinkForm next={next} />
      ) : (
        <PasswordForm next={next} />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={clsx(
        'min-h-[40px] px-3 py-2 font-mono text-[11px] uppercase tracking-[0.18em] transition-colors',
        active
          ? 'bg-cyan/15 text-cyan'
          : 'text-ink-3 hover:text-ink-1',
      )}
    >
      {label}
    </button>
  );
}
