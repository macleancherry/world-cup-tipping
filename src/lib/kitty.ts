export function calcPotentialReturn(stakesCents: number, oddsDecimal: number): number {
  return Math.round(stakesCents * oddsDecimal);
}

export function calcPotentialProfit(stakesCents: number, oddsDecimal: number): number {
  return calcPotentialReturn(stakesCents, oddsDecimal) - stakesCents;
}

export function formatCents(cents: number): string {
  const abs = Math.abs(cents);
  const formatted = `$${(abs / 100).toFixed(2)}`;
  return cents < 0 ? `-${formatted}` : formatted;
}

export function centsToDisplay(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}
