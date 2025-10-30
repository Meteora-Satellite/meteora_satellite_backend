import {
  Commitment,
  PublicKey
} from "@solana/web3.js";
import { StrategyType } from "@meteora-ag/dlmm";

export const SOLANA_COMMITMENT: Commitment = 'confirmed';
export const WSOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");
export const WSOL_DECIMALS = 9;

export const WALLET_KINDS = { external: 'external', custodial: 'custodial' } as const;


export const CLAIM_FEES_MODES = {
  simple: "simple",
  sellIntoSol: "sellIntoSol",
  reinvest: "reinvest"
} as const;
export const STRATEGY_TYPES = {
  spot: 'spot',
  curve: 'curve',
  bidAsk: 'bidAsk'
} as const;

/*
  Standard rebalance:
    - close active position + withdraw all liquidity + claim all fee;
    - swap 50% of token that contain 100% of liquidity to second token;
    - open new(the same) position in range of active bin with liquidity of 50/50 tokens after swap.

  Simple rebalance:
    - claim all fee and "move" all liquidity(including fee) to active bin;
    - without close+swap+open position(same liquidity);
 */
export const REBALANCE_TYPES = {
  standard: 'standard',
  simple: 'simple',
} as const;

export const NOTIFICATION_TYPES = {
  rebalance: 'rebalance',
  feeClaim: 'feeClaim',
  closePosition: 'closePosition',
};

export const StrategyTypesMap: Record<string, StrategyType> = {
  spot: StrategyType.Spot as StrategyType,
  curve: StrategyType.Curve as StrategyType,
  bidask: StrategyType.BidAsk as StrategyType,
};
