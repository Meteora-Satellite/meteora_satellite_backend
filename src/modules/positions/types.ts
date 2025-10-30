import {
  ClaimFeesModeType,
  StrategyTypeStr
} from "@common/types";
import { ISecretBox } from "@modules/wallets/Wallet.model";
import { Types } from "mongoose";

export type CreatePositionType = {
  userId: string | Types.ObjectId;
  poolId: string;
  pair?: string;
  solAmount: string;
  strategyType: StrategyTypeStr;

  takeProfitConfig?: {
    takeProfitPrice?: string;
    stopLossPrice?: string;
  } | null;

  rebalanceConfig?: {
    strategy: StrategyTypeStr;
    stopRebalanceMinimumPrice?: string;
    stopRebalanceMaximumPrice?: string;
  } | null;

  feesConfig?: {
    interval: number;
    mode: ClaimFeesModeType;
    reinvestStrategy?: StrategyTypeStr;
  } | null;

  onchain: {
    positionPubkey: string;
    positionSecret: ISecretBox;
    openSignature: string;
    closeSignature?: string | null;
  }

  rebalancedFromPosition?: string | Types.ObjectId
};

export type ListPositionsParams = {
  userId: string;
  isActive?: boolean;
  poolId?: string;
  strategyType?: StrategyTypeStr;
  page: number;
  limit: number;
  sortBy: 'createdAt' | 'updatedAt';
  order: 'asc' | 'desc';
};
