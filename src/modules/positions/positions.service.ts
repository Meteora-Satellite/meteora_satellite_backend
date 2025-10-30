import {
  IPosition,
  Position,
  PositionDTO
} from './Position.model';
import {
  CreatePositionType,
  ListPositionsParams
} from "@modules/positions/types";
import {
  FilterQuery,
  Types
} from "mongoose";

class PositionService {
  static async createPosition(input: CreatePositionType) {
    return Position.create(input);
  }

  static async listPositions(params: ListPositionsParams): Promise<{ items: PositionDTO[], total: number }> {
    const { userId, isActive = true, poolId, strategyType, page, limit, sortBy, order } = params;

    const q: FilterQuery<typeof Position> = { userId, ...(isActive != null ? { isActive } : {}) };
    if (poolId) q.poolId = poolId;
    if (strategyType) q.strategyType = strategyType;

    const sort: Record<string, 1 | -1> = { [sortBy]: order === 'asc' ? 1 : -1 };

    const [docs, total] = await Promise.all([
      Position.find(q).sort(sort).skip((page - 1) * limit).limit(limit),
      Position.countDocuments(q)
    ]);

    const items = docs.map(d => d.toDTO());
    return { items, total };
  }

  static getUserActivePositionById(userId: string, positionId: string): Promise<IPosition | null> {
    return Position.findOne({ userId, _id: positionId, isActive: true }).lean();
  }

  static getUserPositionById(userId: string, positionId: string): Promise<IPosition | null> {
    return Position.findOne({ userId, _id: positionId }).lean();
  }

  static async closePosition(
      userId: string | Types.ObjectId,
      positionId: string | Types.ObjectId,
      closeSignature: string | null = null,
      rebalancedToPosition: Types.ObjectId | null = null
    ) {
    return Position.findOneAndUpdate(
      { userId, _id: positionId, isActive: true },
      { $set: { isActive: false, "onchain.closeSignature": closeSignature, rebalancedToPosition } },
      { new: true }
    );
  }

  static async setRebalancedToForClosedPosition(positionId: Types.ObjectId, rebalancedToPosition: Types.ObjectId)  {
    return Position.findOneAndUpdate(
      { _id: positionId, isActive: false },
      { rebalancedToPosition }
    );
  }

  static async updateSettings(userId: string, positionId: string, body: { // TODO update body types
    takeProfitConfig?: any;
    rebalanceConfig?: any;
    feesConfig?: any;
  }) {
    const set: Record<string, any> = {};
    if (body.takeProfitConfig !== undefined) set['takeProfitConfig'] = body.takeProfitConfig;
    if (body.rebalanceConfig !== undefined)  set['rebalanceConfig']  = body.rebalanceConfig;
    if (body.feesConfig !== undefined)       set['feesConfig']       = body.feesConfig;

    return Position.findOneAndUpdate(
      {_id: positionId, userId, isActive: true},
      {$set: set},
      { new: true, runValidators: true, context: 'query' }
    );
  }

  static async getAllActivePositionsForPool(poolId: string): Promise<IPosition[]> {
    return Position.find({ poolId, isActive: true }).lean();
  }

  static async getAllActivePositions(): Promise<IPosition[]> {
    return Position.find({ isActive: true }).lean();
  }

  static async getPositionsWithFeesEnabled(): Promise<IPosition[]> {
    return Position.find({
      isActive: true,
      feesConfig: { $exists: true },
    }).lean();
  }

  static async updatePositionLastClaimedAtFees(positionId: Types.ObjectId) {
    return Position.findByIdAndUpdate(positionId, { "feesConfig.lastClaimedAt": new Date() });
  }
}

export default PositionService;
