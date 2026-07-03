/** Money helpers — integer KRW (won). */

export function formatWon(won: number): string {
  const sign = won < 0 ? "-" : "";
  const n = Math.abs(Math.round(won));
  return `${sign}₩${n.toLocaleString("ko-KR")}`;
}

/** Compact percent string, e.g. 0.37 -> "37%". */
export function formatPercent(ratio: number, fractionDigits = 0): string {
  if (!Number.isFinite(ratio)) return "0%";
  return `${(ratio * 100).toFixed(fractionDigits)}%`;
}

export function clampNonNegativeInt(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n));
}
