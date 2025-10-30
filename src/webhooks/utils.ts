import Decimal from "decimal.js";
import PositionService from "@modules/positions/positions.service";

export async function listActivePoolIds(): Promise<string[]> {
  const positions = await PositionService.getAllActivePositions();
  const ids = new Set<string>();
  for (const p of positions) ids.add(p.poolId);
  return Array.from(ids);
}

export function crossedAbove(priceStr: string, thresholdStr: string): boolean {
  const price = new Decimal(priceStr);
  const threshold = new Decimal(thresholdStr);
  return price.gte(threshold);
}

export function crossedBelow(priceStr: string, thresholdStr: string): boolean {
  const price = new Decimal(priceStr);
  const threshold = new Decimal(thresholdStr);
  return price.lte(threshold);
}
