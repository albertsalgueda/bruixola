/**
 * Catalan-locale formatters.
 *
 * All user-facing numeric/date strings flow through here so we can swap the
 * locale or the dash glyph in one place. Empty/null values render as an
 * en dash ('–') — a deliberate choice to make missing data visually obvious
 * without resorting to "N/A" noise.
 */

const LOCALE = 'ca-ES';
const DASH = '–';

const eurFormatter = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat(LOCALE);

const relTimeFormatter = new Intl.RelativeTimeFormat(LOCALE, {
  numeric: 'auto',
});

export function formatEur(n: number): string {
  return eurFormatter.format(Math.round(n));
}

export function formatM2(n: number | null): string {
  if (n == null) return DASH;
  return `${numberFormatter.format(Math.round(n))} m²`;
}

export function formatPct(n: number | null, digits = 1): string {
  if (n == null) return DASH;
  return `${n.toLocaleString(LOCALE, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}%`;
}

export function formatNumber(n: number): string {
  return numberFormatter.format(n);
}

export function formatPriceM2(price: number, m2: number | null): string | null {
  if (m2 == null || m2 <= 0) return null;
  const perM2 = Math.round(price / m2);
  return `€/m² ${numberFormatter.format(perM2)}`;
}

/**
 * Relative-time formatter ("fa 14 minuts", "fa 2 hores"). Takes an ISO
 * timestamp and returns a Catalan relative string. Future timestamps are
 * supported but the codebase currently only uses past ones (scraped_at).
 */
export function formatDateRel(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return DASH;
  const now = Date.now();
  const diffSec = Math.round((then - now) / 1000);
  const abs = Math.abs(diffSec);

  const ranges: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 60 * 60 * 24 * 365],
    ['month', 60 * 60 * 24 * 30],
    ['week', 60 * 60 * 24 * 7],
    ['day', 60 * 60 * 24],
    ['hour', 60 * 60],
    ['minute', 60],
    ['second', 1],
  ];

  for (const [unit, secondsInUnit] of ranges) {
    if (abs >= secondsInUnit || unit === 'second') {
      const value = Math.round(diffSec / secondsInUnit);
      return relTimeFormatter.format(value, unit);
    }
  }
  return DASH;
}
