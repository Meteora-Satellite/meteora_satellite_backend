import PositionService from "@modules/positions/positions.service";
import MeteoraClient from "../meteora/index";
import NotificationService from "@modules/notifications/notifications.service";
import { NotificationType } from "@common/types";
import {
  getSignerForUser,
} from "../solana/utils";
import {
  crossedAbove,
  crossedBelow
} from "./utils";
import PoolListener from "./pool-listener";
import { encryptAesGcm } from "@common/secret-box";
import { REBALANCE_TYPES } from "@common/constants";

/**
 * Runtime state so we don't re-trigger the same position repeatedly
 * or double-close on choppy ticks.
 */
type RuntimeState = {
  lastSeenPrice?: string;
  // Last "side" of the threshold to detect true crossings
  wasBelowSL?: boolean;
  wasAboveTP?: boolean;
  // Prevent concurrent closes for the same position
  isaAggregating?: boolean;
  // Timestamp of last trigger attempt (for cooldown)
  lastTriggerMs?: number;
};

const runtimeByPosId = new Map<string, RuntimeState>();

const COOLDOWN_MS = 1000;         // don't refire within 1s

export default class TriggerEngine {
  static async onPoolPrice({ poolId, tokensPerSOL }: {
    poolId: string;
    tokensPerSOL: string;
  }) {
    const positions = await PositionService.getAllActivePositionsForPool(poolId);

    for (const position of positions) {
      const positionId = position._id.toString();
      const state = runtimeByPosId.get(positionId) ?? {};
      try {
        const now = Date.now();
        runtimeByPosId.set(positionId, state);

        state.lastSeenPrice = tokensPerSOL;

        if (state.isaAggregating) continue; // already in-flight
        if (state.lastTriggerMs && now - state.lastTriggerMs < COOLDOWN_MS) continue;

        const tp = position.takeProfitConfig?.takeProfitPrice;
        const sl = position.takeProfitConfig?.stopLossPrice;

        let shouldClose = false;
        let reason: "take profit" | "stop loss" | undefined;

        // Evaluate SL first (protect downside)
        if (sl !== undefined) {
          const below = crossedBelow(tokensPerSOL, sl);
          if (below && state.wasBelowSL !== true) {
            shouldClose = true;
            reason = "stop loss";
          }
          state.wasBelowSL = below;
        }
        // Then TP
        if (!shouldClose && tp !== undefined) {
          const above = crossedAbove(tokensPerSOL, tp);
          if (above && state.wasAboveTP !== true) {
            shouldClose = true;
            reason = "take profit";
          }
          state.wasAboveTP = above;
        }

        if (!shouldClose) {
          if (position.rebalanceConfig == null) return;

          state.isaAggregating = true;
          state.lastTriggerMs = now;

          const isInRange = await MeteoraClient.positionIsInRange(position.poolId, position.onchain.positionPubkey);
          if (!isInRange) {
            console.log(`Run ${position.rebalanceConfig.type} rebalance position ${positionId}`);
            const signer = await getSignerForUser(position.userId);

            let rebalanceTxSignature: string;
            if (position.rebalanceConfig.type == REBALANCE_TYPES.standard || !position.rebalanceConfig.type) {
              const rebalanceResult = await MeteoraClient.standardRebalance(
                signer,
                position.poolId,
                position.onchain.positionPubkey,
                position.rebalanceConfig.strategy
              );
              console.log(`Standard rebalance position ${positionId} tx`, rebalanceResult.openNewPositionSignature);

              await PositionService.closePosition(
                position.userId,
                positionId,
                rebalanceResult.closeOldPositionSignature
              );

              const newPosition = await PositionService.createPosition({
                userId: position.userId,
                poolId: position.poolId,
                solAmount: position.solAmount,
                strategyType: position.rebalanceConfig.strategy,
                takeProfitConfig: position.takeProfitConfig,
                rebalanceConfig: position.rebalanceConfig,
                feesConfig: position.feesConfig,
                onchain: {
                  positionPubkey: rebalanceResult.newPositionKeypair.publicKey.toBase58(),
                  positionSecret: encryptAesGcm(Buffer.from(rebalanceResult.newPositionKeypair.secretKey)),
                  openSignature: rebalanceResult.openNewPositionSignature,
                },
                rebalancedFromPosition: position._id
              });

              await PositionService.setRebalancedToForClosedPosition(position._id, newPosition._id);

              rebalanceTxSignature = rebalanceResult.openNewPositionSignature;
            } else {
              rebalanceTxSignature = await MeteoraClient.simpleRebalance(
                signer,
                position.poolId,
                position.onchain.positionPubkey,
                position.rebalanceConfig.strategy
              );
              console.log(`Simple rebalance position ${positionId} tx`, rebalanceTxSignature);
            }

            await NotificationService.create({ // TODO move all notification creation to separate file(after setup Firebase)
              userId: position.userId,
              title: `Rebalance position.`,
              body: `Your position ${positionId} has been successfully rebalanced at price ${tokensPerSOL}(rebalance type - ${position.rebalanceConfig.type}!`,
              type: NotificationType.rebalance,
              data: {
                transactionSignature: rebalanceTxSignature,
                positionId
              }
            });
          }
          state.isaAggregating = false;
          return;
        }
        console.log("Close position by trigger: price -", tokensPerSOL, '| stop-loss -', sl, '| take profit -', tp, '| reason -',  reason)

        // Execute close with idempotency
        state.isaAggregating = true;
        state.lastTriggerMs = now;

        try {
          const signer = await getSignerForUser(position.userId);
          const closePositionSignature = await MeteoraClient.closePosition(
            signer,
            position.poolId,
            position.onchain.positionPubkey
          );
          console.log(`Close position ${positionId} signature`, closePositionSignature);

          await PositionService.closePosition(
            position.userId.toString(),
            positionId,
            closePositionSignature
          );
          if (!closePositionSignature.includes('not found')) { // TODO refactor this(make it via throw Error)
            await NotificationService.create({
              userId: position.userId,
              title: `Position ${reason}.`,
              body: `Your position ${positionId} has been successfully closed by ${reason} at price ${tokensPerSOL}!`,
              type: NotificationType.closePosition,
              data: {
                transactionSignature: closePositionSignature,
                positionId
              }
            });
          }
          const positionsForPool = await PositionService.getAllActivePositionsForPool(poolId);
          if (positionsForPool.length == 0) await PoolListener.unsubscribePool(poolId);

          runtimeByPosId.delete(positionId);
        } catch (err) {
          console.error(`Close failed for position=${positionId}:`, err);
          state.isaAggregating = false;
        }
      } catch (error) {
        console.error(`Error aggregation position ${positionId} in "onPoolPrice":`, error);
        state.isaAggregating = false;
      }
    }
  }
}
