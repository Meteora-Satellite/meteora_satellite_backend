import { Request, Response } from 'express';
import {
  ClaimFeesBody,
  ClaimFeesParams,
  ClosePositionParams,
  CreatePositionBody,
  ListPositionsQuery,
  RebalanceBody,
  RebalanceParams,
  RemoveLiquidityParams,
  RemoveLiquidityQuery,
  UpdatePositionBody,
  UpdatePositionParams
} from './positions.schema';
import PositionService from "@modules/positions/positions.service";
import MeteoraClient from "../../meteora/index";
import { WalletService } from "@modules/wallets/wallets.service";
import {
  getSignerForUser,
  privateKeyFromWallet
} from "../../solana/utils";
import SolanaMethods from "../../solana/methods";
import { encryptAesGcm } from "@common/secret-box";
import {
  Keypair,
} from "@solana/web3.js";
import Decimal from "decimal.js";
import PoolListener from "../../webhooks/pool-listener";
import { logger } from "@lib/logger";
import {
  CLAIM_FEES_MODES,
} from "@common/constants";
import { ClaimFeesModeType } from "@common/types";


export default class PositionsController {
  static async create(req: Request<{}, {}, CreatePositionBody>, res: Response) {
    try {
      const body = req.body;

      const wallet = await WalletService.findCustodialByUser(req.user.uid);
      if (!wallet) {
        return res.status(400).json({ok: false, error: { message: 'Custodial wallet not found for user.' }});
      }

      const secretKey = privateKeyFromWallet(wallet);
      const signer = Keypair.fromSecretKey(secretKey);

      const solBalance = await SolanaMethods.getWalletBalances(wallet.address, true);
      if (parseFloat(solBalance.solana) < parseFloat(body.solAmount)) {
        return res.status(400).json({ok: false, error: { message: 'Insufficient SOL balance in wallet.' }});
      }

      const { signature, positionKeypair } = await MeteoraClient.createBalancePosition(
        signer,
        body.poolId,
        body.strategyType,
        Decimal(body.solAmount),
      )

      const position = await PositionService.createPosition({
        userId: req.user.uid,
        poolId: body.poolId,
        solAmount: body.solAmount,
        strategyType: body.strategyType,
        takeProfitConfig: body.takeProfitConfig ?? null,
        rebalanceConfig: body.rebalanceConfig ?? null,
        feesConfig: body.feesConfig ?? null,
        onchain: {
          positionPubkey: positionKeypair.publicKey.toBase58(),
          positionSecret: encryptAesGcm(Buffer.from(positionKeypair.secretKey)),
          openSignature: signature,
        }
      });

      logger.info("Create pool listener");
      await PoolListener.subscribePool(body.poolId);

      res.status(201).json({ok: true, data: position.toDTO() });
    } catch (error: any) {
      console.error('Error creating position:', error);
      res.status(400).json({ok: false, error: { message: 'Error creating position. ' + error?.message }});
    }
  }

  static async list(req: Request<{}, any, any, ListPositionsQuery>, res: Response) {
    const { page, limit, poolId, strategyType, sortBy, order } = req.query;

    const { items, total } = await PositionService.listPositions({
      userId: req.user.uid,
      isActive: true,
      poolId,
      strategyType,
      page,
      limit,
      sortBy,
      order
    });

    return res.json({
      ok: true,
      data: { items, page, limit, total }
    });
  }

  static async removeLiquidity(
    req: Request<RemoveLiquidityParams, any, any, RemoveLiquidityQuery>,
    res: Response
  ) {
    const { positionId } = req.params;
    const { percentage } = req.query;

    // Ensure the active position exists and belongs to the user
    const position = await PositionService.getUserActivePositionById(req.user.uid, positionId);
    if (!position) {
      return res.status(404).json({ ok: false, error: { message: 'Active position not found.' } });
    }

    // No web3 action yet — just acknowledge intent
    return res.json({
      ok: true,
      data: {
        positionId: String(position._id),
        poolId: position.poolId,
        percentage
      }
    });
  }

  static async closePosition(
    req: Request<ClosePositionParams>,
    res: Response
  ) {
    try {
      const { positionId } = req.params;
      const userId = req.user.uid;

      const position = await PositionService.getUserActivePositionById(userId, positionId);
      if (!position) {
        return res.status(404).json({ ok: false, error: { message: 'Active position not found' } });
      }

      const signer = await getSignerForUser(position.userId);

      let closeOnchainPositionSignature: string | null = await MeteoraClient.closePosition(
        signer,
        position.poolId,
        position.onchain.positionPubkey
      );
      if (closeOnchainPositionSignature.toLowerCase().includes('not found')) {
        closeOnchainPositionSignature = null;
      }

      const closedPosition = await PositionService.closePosition(userId, positionId, closeOnchainPositionSignature);

      const positionsForPool = await PositionService.getAllActivePositionsForPool(position.poolId);
      if (positionsForPool.length == 0) await PoolListener.unsubscribePool(position.poolId);

      return res.json({ ok: true, data: closedPosition!.toDTO() });
    } catch (error) {
      console.error('Error closing position:', error);
      res.status(400).json({ ok: false, error: { message: 'Internal server error.' }});
    }
  }

  static async claimFees(
    req: Request<ClaimFeesParams, any, ClaimFeesBody>,
    res: Response
  ) {
    const { positionId } = req.params;
    const { addLiquidity, swap, strategyType } = req.body;

    const position = await PositionService.getUserActivePositionById(req.user.uid, positionId);
    if (!position) {
      return res.status(404).json({ ok: false, error: { message: 'Active position not found' } });
    }

    const mode: ClaimFeesModeType = addLiquidity // update this to "mode" on frontend
      ? CLAIM_FEES_MODES.reinvest
      : swap
        ? CLAIM_FEES_MODES.sellIntoSol
        : CLAIM_FEES_MODES.simple;

    const signer = await getSignerForUser(position.userId);
    await MeteoraClient.claimFees(
      signer,
      position.poolId,
      position.onchain.positionPubkey,
      mode,
      strategyType
    );

    return res.json({
      ok: true,
      data: {
        positionId,
        poolId: position.poolId,
        mode,
        strategyType
      }
    });
  }

  static async rebalance(
    req: Request<RebalanceParams, any, RebalanceBody>,
    res: Response
  ) {
    const { positionId } = req.params;
    const { strategyType } = req.body;
    const userId = req.user.uid;

    const oldPosition = await PositionService.getUserPositionById(userId, positionId);
    if (!oldPosition) {
      return res.status(400).json({ok: false, error: { message: 'Position not found' }});
    }

    const signer = await getSignerForUser(userId);

    const rebalanceResult = await MeteoraClient.standardRebalance(
      signer,
      oldPosition.poolId,
      oldPosition.onchain.positionPubkey,
      strategyType
    )

    await PositionService.closePosition(userId, oldPosition._id, rebalanceResult.closeOldPositionSignature);

    const newPosition = await PositionService.createPosition({
      userId,
      poolId: oldPosition.poolId,
      solAmount: oldPosition.solAmount,
      strategyType,
      takeProfitConfig: oldPosition.takeProfitConfig,
      rebalanceConfig: oldPosition.rebalanceConfig,
      feesConfig: oldPosition.feesConfig,
      onchain: {
        positionPubkey: rebalanceResult.newPositionKeypair.publicKey.toBase58(),
        positionSecret: encryptAesGcm(Buffer.from(rebalanceResult.newPositionKeypair.secretKey)),
        openSignature: rebalanceResult.openNewPositionSignature,
      },
      rebalancedFromPosition: oldPosition._id
    });

    return res.json({
      ok: true,
      data: {
        positionId,
        poolId: newPosition.poolId,
        strategyType
      }
    });
  }

  static async update(
    req: Request<UpdatePositionParams, any, UpdatePositionBody>,
    res: Response
  ) {
    const { positionId } = req.params;

    const doc = await PositionService.updateSettings(req.user.uid, positionId, req.body);
    if (!doc) {
      return res.status(404).json({ ok: false, error: { message: 'Active position not found' } });
    }
    return res.json({ ok: true, data: doc.toDTO() });
  }
}
