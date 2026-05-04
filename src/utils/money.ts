
export function formatCurrency(amount: number): string {
  const safeAmount = Number.isFinite(Number(amount)) ? Number(amount) : 0;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(safeAmount);
}

export function formatPercent(value: number): string {
  const safeValue = Number.isFinite(Number(value)) ? Number(value) : 0;
  return new Intl.NumberFormat('en-US', {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(safeValue);
}
