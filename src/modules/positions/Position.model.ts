import { Schema, model, Types, HydratedDocument, Model } from 'mongoose';
import {
  CLAIM_FEES_MODES,
  REBALANCE_TYPES,
  STRATEGY_TYPES
} from '@common/constants';
import {
  ClaimFeesModeType,
  RebalanceType,
  StrategyTypeStr
} from '@common/types';
import { SecretBoxSchema } from "@common/schemas";
import { ISecretBox } from "@modules/wallets/Wallet.model";

export type PositionDTO = {
  id: string;
  poolId: string;
  solAmount: string;
  strategyType: StrategyTypeStr;

  takeProfitConfig?: {
    takeProfitPrice?: string;
    stopLossPrice?: string;
  } | null;
  rebalanceConfig?: {
    strategy: StrategyTypeStr;
    type: RebalanceType;
    stopRebalanceMinimumPrice?: string;
    stopRebalanceMaximumPrice?: string;
  } | null;
  feesConfig?: {
    interval: number;
    mode: ClaimFeesModeType;
    reinvestStrategy: StrategyTypeStr;
  } | null;

  openingTxSignature: string;
  createdAt: Date;
  updatedAt: Date;
};

export interface IPosition {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  poolId: string;
  pair?: string;
  isActive: boolean;
  solAmount: string;
  strategyType: StrategyTypeStr;

  takeProfitConfig?: {
    takeProfitPrice?: string;
    stopLossPrice?: string;
  } | null;
  rebalanceConfig?: {
    strategy: StrategyTypeStr;
    type: RebalanceType;
    stopRebalanceMinimumPrice?: string;
    stopRebalanceMaximumPrice?: string;
  } | null;
  feesConfig?: {
    interval: number;
    mode: ClaimFeesModeType;
    reinvestStrategy: StrategyTypeStr;
    lastClaimedAt: Date;
  } | null;

  onchain: {
    positionPubkey: string;
    positionSecret: ISecretBox;
    openSignature: string;
    closeSignature?: string | null;
  };

  rebalancedFromPosition?: Types.ObjectId;
  rebalancedToPosition?: Types.ObjectId;

  createdAt: Date;
  updatedAt: Date;
}

/** Mongoose methods on the document */
interface PositionMethods {
  toDTO(this: HydratedDocument<IPosition>): PositionDTO;
}

/** Mongoose model type (no statics for now) */
type PositionModel = Model<IPosition, {}, PositionMethods>;

const TakeProfitSchema = new Schema<IPosition['takeProfitConfig']>(
  {
    takeProfitPrice: { type: String },
    stopLossPrice: { type: String }
  },
  { _id: false }
);

const RebalanceSchema = new Schema<IPosition['rebalanceConfig']>(
  {
    strategy: { type: String, enum: STRATEGY_TYPES, required: true },
    type: { type: String, enum: REBALANCE_TYPES, default: REBALANCE_TYPES.standard, required: true },
    stopRebalanceMinimumPrice: { type: String },
    stopRebalanceMaximumPrice: { type: String }
  },
  { _id: false }
);

const FeesSchema = new Schema<IPosition['feesConfig']>(
  {
    interval: { type: Number, min: 1, required: true }, // minutes
    mode: { type: String, enum: CLAIM_FEES_MODES, required: true },
    reinvestStrategy: {
      type: String,
      enum: STRATEGY_TYPES,
      required: function (this: IPosition['feesConfig']) {
        return this?.mode === 'reinvest';
      },
    },
    lastClaimedAt: { type: Date, default: new Date() },
  },
  { _id: false }
);

const OnchainSchema = new Schema<IPosition['onchain']>(
  {
    positionPubkey: { type: String, required: true, index: true },
    positionSecret: { type: SecretBoxSchema, required: true, select: false },
    openSignature:  { type: String, required: true },
    closeSignature: { type: String, default: null },
  },
  { _id: false }
);

const PositionSchema = new Schema<IPosition, PositionModel, PositionMethods>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    poolId: { type: String, required: true, index: true },
    pair: { type: String, default: null },
    solAmount: { type: String, required: true },
    strategyType: { type: String, enum: STRATEGY_TYPES, required: true },

    isActive: { type: Boolean, default: true },

    takeProfitConfig: { type: TakeProfitSchema, default: null },
    rebalanceConfig: { type: RebalanceSchema, default: null },
    feesConfig: { type: FeesSchema, default: null },

    onchain: { type: OnchainSchema, required: true },

    rebalancedFromPosition: { type: Schema.Types.ObjectId, ref: 'Position', default: null },
    rebalancedToPosition: { type: Schema.Types.ObjectId, ref: 'Position', default: null },
  },
  { timestamps: true }
);

PositionSchema.index({ userId: 1, poolId: 1 }, { unique: false });

PositionSchema.method('toDTO', function toDTO(this: HydratedDocument<IPosition>): PositionDTO {
  return {
    id: this._id.toString(),
    poolId: this.poolId,
    solAmount: this.solAmount,
    strategyType: this.strategyType,
    takeProfitConfig: this.takeProfitConfig ?? null,
    rebalanceConfig: this.rebalanceConfig ?? null,
    feesConfig: this.feesConfig ?? null,
    openingTxSignature: this.onchain.openSignature,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt
  };
});

export const Position = model<IPosition, PositionModel>('Position', PositionSchema);
