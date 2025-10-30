import BN from "bn.js";
import Decimal from "decimal.js";

export function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
export function backoff(attempt: number, base: number, cap: number) {
  const exp = Math.min(cap, Math.round(base * Math.pow(2, attempt - 1)));
  const jitter = Math.round(exp * (Math.random() * 0.3)); // up to +30%
  return exp + jitter;
}

export function fromBaseUnits(atoms: BN | bigint | number, decimals: number): Decimal {
  const n = BigInt(atoms.toString());
  const base = 10n ** BigInt(decimals);
  return Decimal(Number(n) / Number(base));
}
