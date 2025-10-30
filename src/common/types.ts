import {
  Keypair,
} from "@solana/web3.js";
import {
  CLAIM_FEES_MODES,
  REBALANCE_TYPES,
  STRATEGY_TYPES,
  WALLET_KINDS
} from "@common/constants";

export type WalletKindType = typeof WALLET_KINDS[keyof typeof WALLET_KINDS];
export type ClaimFeesModeType = typeof CLAIM_FEES_MODES[keyof typeof CLAIM_FEES_MODES];
export type StrategyTypeStr = typeof STRATEGY_TYPES[keyof typeof STRATEGY_TYPES];
export type RebalanceType = typeof REBALANCE_TYPES[keyof typeof REBALANCE_TYPES];

export type SwapTokenInput = {
  signer: Keypair;
  inputMint: string;
  outputMint: string;
  amount: string;     // Human amount, e.g. "0.25"
};

export type JupiterSwapOrderResponse = {
  transaction: string | null;
  requestId: string;
  inAmount: string;
  outAmount: string;
  priceImpact: number;
  routePlan: any[];
  errorCode?: number;
  errorMessage?: string;
  gasless: boolean;
  signatureFeeLamports: number;
  prioritizationFeeLamports: number;
}

export type SwapTokenResult = {
  signature: string;
  outAmount: string;
  realOutAmount: string;
};

export enum NotificationType {
  rebalance = "rebalance",
  feeClaim = "feeClaim",
  closePosition = "closePosition",
}

export enum NotificationKind {
  GENERIC = "GENERIC",
  SYSTEM = "SYSTEM",
  SECURITY = "SECURITY",
  MARKETING = "MARKETING",
}
