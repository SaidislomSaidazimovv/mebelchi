export function sellingPrice(costUzs: number, marginPct: number): number {
  return Math.round(costUzs * (1 + marginPct / 100));
}
