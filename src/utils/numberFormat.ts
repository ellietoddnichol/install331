export function toSafeNumber(value: unknown, fallback = 0): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export function formatNumberSafe(value: unknown, fractionDigits = 2): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(toSafeNumber(value));
}

export function formatCurrencySafe(value: unknown, fractionDigits = 2): string {
  return `$${formatNumberSafe(value, fractionDigits)}`;
}

export function formatPercentSafe(value: unknown, fractionDigits = 2): string {
  return `${formatNumberSafe(value, fractionDigits)}%`;
}

export function formatKilobytesSafe(bytes: unknown, fractionDigits = 1): string {
  const kb = toSafeNumber(bytes) / 1024;
  return `${formatNumberSafe(kb, fractionDigits)} KB`;
}

export function safeDivide(numerator: unknown, denominator: unknown, fallback = 0): number {
  const n = toSafeNumber(numerator);
  const d = toSafeNumber(denominator);
  if (d === 0) return fallback;
  return n / d;
}

/** Renders labor as minutes when under an hour, otherwise as hours (with rounded minutes in parentheses). */
export function formatLaborDurationMinutes(totalMinutes: unknown): string {
  const m = toSafeNumber(totalMinutes);
  if (m <= 0) return '—';
  const roundedMin = Math.round(m * 100) / 100;
  if (roundedMin < 60) {
    const fd = roundedMin % 1 === 0 ? 0 : 1;
    return `${formatNumberSafe(roundedMin, fd)} min`;
  }
  const hours = roundedMin / 60;
  const hrStr = formatNumberSafe(hours, hours % 1 === 0 ? 0 : 1);
  const minWhole = Math.round(roundedMin);
  return `${hrStr} hr (${minWhole} min)`;
}