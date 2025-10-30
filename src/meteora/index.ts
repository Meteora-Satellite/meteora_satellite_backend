import {
  Keypair,
  PublicKey,
  Transaction,
} from "@solana/web3.js";
import BN from "bn.js";
import DLMM, { LbPosition, } from '@meteora-ag/dlmm';
import SolanaConnection from "../solana/index";
import HeliusConnection from "../solana/helius";
import SolanaMethods from "../solana/methods";
import JitoClient from "../jito/index";
import {
  CLAIM_FEES_MODES,
  STRATEGY_TYPES,
  StrategyTypesMap,
  WSOL_DECIMALS,
  WSOL_MINT
} from "@common/constants";
import {
  fromBaseUnits,
  sleep
} from "@common/utils";
import Decimal from "decimal.js";
import { getOrCreateAssociatedTokenAccount } from "@solana/spl-token";
import {
  ClaimFeesModeType,
  StrategyTypeStr
} from "@common/types";

// TODO think about "keep all number in one formate - BN or Decimal"

function toBaseUnitsExact(human: string | number | Decimal, decimals: number): BN {
  const s = String(human);
  const [i, f = ""] = s.split(".");
  const frac = (f + "0".repeat(decimals)).slice(0, decimals);
  return new BN(i || "0").mul(new BN(10).pow(new BN(decimals))).add(new BN(frac || "0"));
}

export default new class MeteoraClient {
  private dlmmCache = new Map<string, DLMM>();

  async createPoolConnection(poolAddress: string): Promise<DLMM> {
    // @ts-ignore, check it out later
    return await DLMM.default.create(SolanaConnection, new PublicKey(poolAddress));
  }

  async getDlmm(poolId: string): Promise<DLMM> {
    const cached = this.dlmmCache.get(poolId);
    if (cached) return cached;
    const dlmm = await this.createPoolConnection(poolId);
    this.dlmmCache.set(poolId, dlmm);
    return dlmm;
  }

  async getTokenPriceFromPool(poolId: string): Promise<string> {
    const dlmm = await this.getDlmm(poolId);
    const activeBin = await dlmm.getActiveBin();

    let tokenDecimals: number;
    if (dlmm.tokenX.publicKey.toString() == WSOL_MINT.toString()) {
      tokenDecimals = dlmm.tokenY.mint.decimals;
    } else if (dlmm.tokenY.publicKey.toString() == WSOL_MINT.toString()) {
      tokenDecimals = dlmm.tokenX.mint.decimals;
    } else {
      throw new Error("Pool is not SOL-pair");
    }

    // convert the bin price to human view(as user see it's on site)
    const yPerXHuman = new Decimal(activeBin.price).mul(new Decimal(10).pow(tokenDecimals - WSOL_DECIMALS));

    return yPerXHuman.toFixed(); // tokens per 1 SOL
  }

  /**
   * Open a position in a SOL/token DLMM pool.
   * - SOL is the fixed side (no ATA work).
   * - We only ensure/create the ATA for the non-SOL token.
   * - `solValue`: total SOL user contributes; `swapPortion` of it is swapped to the token for dual-sided add.
   */
  async createBalancePosition(
    signer: Keypair,
    poolAddress: string,
    strategyType: string,
    solValue: Decimal,
    tokenValue: Decimal = Decimal(0),  // set this to "false" after swap and don't swap in case tokens is already swapped
    totalRangeInterval = 10,              // later each user will set it for himself this value
    maxRetries = 5,
    swapPortion = 0.5,                    // 0..1: fraction of SOL to swap into token side (default 50%)
  ): Promise<{ signature: string; positionKeypair: Keypair }> {
    console.log('Creating balance position initialized:',{
      poolAddress,
      strategyType,
      solValue,
      tokenValue
    })
    let attempt = 1;
    let tokenAtoms = new BN(0);

    let totalXAmount: BN;
    let totalYAmount: BN;

    while (attempt <= maxRetries) {
      try {
        console.log(`🔁 Attempt ${attempt} to create position`);

        const dlmmPool = await this.getDlmm(poolAddress);

        // Pool mints & SOL detection
        const xMint = dlmmPool.lbPair.tokenXMint as PublicKey;
        const yMint = dlmmPool.lbPair.tokenYMint as PublicKey;
        const isXSol = xMint.equals(WSOL_MINT);
        const isYSol = yMint.equals(WSOL_MINT);
        if (!isXSol && !isYSol) throw new Error("Pool is not a SOL pair; extend for token-token pools.");

        if (tokenValue.isZero()) {
          const tokenMint = isXSol ? yMint : xMint; // the non-SOL mint

          // Split SOL: keep some as SOL, swap the rest to the token side
          const totalLamports = toBaseUnitsExact(solValue, 9); // lamports
          const toSwapLamports = totalLamports.mul(new BN(Math.round(swapPortion * 10_000))).div(new BN(10_000));
          const keepSolLamports = totalLamports.sub(toSwapLamports);

          // Swap SOL → token via Ultra. Ultra returns atoms already — don't rescale.
          if (toSwapLamports.gt(new BN(0))) {
            const swapRes = await SolanaMethods.swapToken({
              signer,
              inputMint: WSOL_MINT.toBase58(),
              outputMint: tokenMint.toBase58(),
              amount: (Number(toSwapLamports.toString()) / 1e9).toString(), // human SOL for Ultra
            });
            tokenAtoms = new BN(swapRes.realOutAmount);
            tokenValue = Decimal(tokenAtoms.toString());
          }

          // Map amounts to X/Y according to which side is SOL
          if (isXSol) {
            totalXAmount = keepSolLamports; // SOL on X
            totalYAmount = tokenAtoms;      // token on Y
          } else {
            totalXAmount = tokenAtoms;      // token on X
            totalYAmount = keepSolLamports; // SOL on Y
          }
        } else {
          if (isXSol) {
            totalXAmount = new BN(solValue.toNumber()); // SOL on X
            totalYAmount = new BN(tokenValue.toNumber());      // token on Y
          } else {
            totalXAmount = new BN(tokenValue.toNumber());      // token on X
            totalYAmount = new BN(solValue.toNumber()); // SOL on Y
          }
        }

        // Strategy enum
        const strategy = StrategyTypesMap[strategyType.toLowerCase()];
        // Get active bin (number) and derive a simple symmetric strategy
        const activeBinObj = await dlmmPool.getActiveBin();
        const activeBin = activeBinObj.binId;
        const minBinId = activeBin - totalRangeInterval;
        const maxBinId = activeBin + totalRangeInterval;

        // Build tx
        const positionKeypair = Keypair.generate();

        console.log('Initialize position:',{
          totalXAmount: fromBaseUnits(totalXAmount, dlmmPool.tokenX.mint.decimals),
          totalYAmount: fromBaseUnits(totalYAmount, dlmmPool.tokenY.mint.decimals),
          strategy: { strategyType: strategy, minBinId, maxBinId },
          slippage: attempt * 2,
          poolAddress
        });

        const createPositionTx = await dlmmPool.initializePositionAndAddLiquidityByStrategy({
          positionPubKey: positionKeypair.publicKey,
          user: signer.publicKey,
          totalXAmount,
          totalYAmount,
          strategy: { strategyType: strategy, minBinId, maxBinId },
          slippage: 100 // default slippage - 2, increase for 2 with each attempt (100 for tests)
        });

        // Send
        const createPositionSignature = await JitoClient.sendTransaction(signer, createPositionTx, [positionKeypair]);
        console.log('✅Create position transaction signature', createPositionSignature);

        return { signature: createPositionSignature, positionKeypair };
      } catch (err: any) {
        console.log(err)
        const msg = err?.message || String(err);
        console.error(`❌ Position creation attempt ${attempt} failed:`, msg);
        attempt++;

        if (attempt <= maxRetries) {
          const base = 1000;
          const exp = Math.pow(2, attempt - 1) * base;
          const jitter = exp * 0.25 * (Math.random() * 2 - 1);
          const delayMs = Math.round(exp + jitter);
          console.log(`⏳ Waiting ${delayMs}ms before retry attempt ${attempt}...`);
          await sleep(delayMs);
        }
      }
    }

    throw new Error(
      `Position creation failed after ${maxRetries} attempts.`
    );
  }

  async closePosition(
    signer: Keypair,
    poolAddress: string,
    positionPublicKeyString: string,
    swapTokenToSolAfterClosings: boolean = true
  ): Promise<string> {
    try {
      const dlmmPool = await this.getDlmm(poolAddress);
      let position: LbPosition;

      const positionPublicKey = new PublicKey(positionPublicKeyString);

      try {
        position = await dlmmPool.getPosition(positionPublicKey);
      } catch (e:any) {
        return 'Position is not found in blockchain';
      }

      if (parseFloat(position.positionData.totalXAmount) + parseFloat(position.positionData.totalYAmount) > 0) {
        const removeLiquidityTxs = await dlmmPool.removeLiquidity({
          user: signer.publicKey,
          position: position.publicKey,
          fromBinId: position.positionData.lowerBinId,
          toBinId: position.positionData.upperBinId,
          bps: new BN(Math.floor(100 * 100)),  // 100% in basis points
          shouldClaimAndClose: true,
        });

        if (removeLiquidityTxs.length > 1) {
          const removeLiquidityBundleId = await JitoClient.sendBundle(signer, removeLiquidityTxs);
          console.log('✅Remove liquidity(and close position) Jito bundle id', removeLiquidityBundleId);
          return removeLiquidityBundleId;
        } else {
          const removeLiquiditySignature = await JitoClient.sendTransaction(signer, removeLiquidityTxs[0]);
          console.log('✅Remove liquidity(and close position) transaction signature', removeLiquiditySignature);

          // swap all tokens from the pool in SOl
          if (swapTokenToSolAfterClosings) {
            const tokenAmount = position.positionData.feeX.add(new BN(position.positionData.totalXAmount));
            if (!tokenAmount.isZero()) {
              await SolanaMethods.swapToken({
                signer,
                inputMint: dlmmPool.tokenX.mint.address.toString(),
                outputMint: dlmmPool.tokenY.mint.address.toString(),
                amount: fromBaseUnits(tokenAmount, dlmmPool.tokenX.mint.decimals).toString()
              });
            }
          }

          return removeLiquiditySignature;
        }
      } else {
        if (!position.positionData.feeX.add(position.positionData.feeY).eq(new BN(0))) {
          await this.claimFees(signer, poolAddress, positionPublicKeyString, CLAIM_FEES_MODES.simple, STRATEGY_TYPES.spot, dlmmPool, position);

          let feeClaimCheckAttempts = 0;
          while (true) {
            await sleep(5000);

            const updatedPosition = await dlmmPool.getPosition(positionPublicKey)
            console.log('Fee in updated position: ', updatedPosition.positionData.feeX.toString(), updatedPosition.positionData.feeY.toString());

            if (updatedPosition.positionData.feeX.add(updatedPosition.positionData.feeY).eq(new BN(0))) break;

            feeClaimCheckAttempts++;

            if (feeClaimCheckAttempts > 5) {
              throw new Error('Error claim fee, after 5 fee claim check attempts.');
            }
          }
        }

        const closePositionTx = await dlmmPool.closePosition({ owner: signer.publicKey, position });

        const closePositionTxSignature = await JitoClient.sendTransaction(signer, closePositionTx)
        console.log("✅ Close position transaction signature:", closePositionTxSignature);

        return closePositionTxSignature;
      }
    } catch (error) {
      console.error("Error closing position:", error);
      throw error;
    }
  }

  async claimFees(
    signer: Keypair,
    poolAddress: string,
    positionPublicKey: string,
    mode: ClaimFeesModeType = CLAIM_FEES_MODES.simple,
    reinvestStrategy: StrategyTypeStr = STRATEGY_TYPES.spot,
    dlmmPool: DLMM | undefined = undefined,
    position: LbPosition | undefined = undefined,
    attempts: number = 3,
  ): Promise<{ signature: string, tokenXClaimedAmount: BN, tokenYClaimedAmount: BN }> {
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        if (!dlmmPool) {
          dlmmPool = await this.getDlmm(poolAddress);
        }

        if (!position) {
          position = await dlmmPool.getPosition(new PublicKey(positionPublicKey));
        }

        const claimFeeTxs = await dlmmPool.claimSwapFee({ owner: signer.publicKey, position });

        let claimFeeTxSignature: string;
        if (claimFeeTxs.length > 1) {
          claimFeeTxSignature = await JitoClient.sendBundle(signer, claimFeeTxs);
          console.log('✅Claim fee Jito bundle id', claimFeeTxSignature);
        } else {
          claimFeeTxSignature = await JitoClient.sendTransaction(signer, claimFeeTxs[0]);
          console.log('✅Claim fee transaction hash', claimFeeTxSignature);
        }

        const tokenXClaimedAmount = position.positionData.feeX;
        const tokenYClaimedAmount = position.positionData.feeY;

        switch (mode) {
          case CLAIM_FEES_MODES.sellIntoSol:
            if (tokenXClaimedAmount.lten(0)) break;

            await SolanaMethods.swapToken({
              signer,
              inputMint: dlmmPool.tokenX.mint.address.toString(),
              outputMint: dlmmPool.tokenY.mint.address.toString(),
              amount: fromBaseUnits(tokenXClaimedAmount, dlmmPool.tokenX.mint.decimals).toString()
            })
            break;
          case CLAIM_FEES_MODES.reinvest:
            const addLiquidityTx = await dlmmPool.addLiquidityByStrategy({
              positionPubKey: new PublicKey(positionPublicKey),
              totalXAmount: tokenXClaimedAmount,
              totalYAmount: tokenYClaimedAmount,
              strategy: {
                minBinId: position.positionData.lowerBinId,
                maxBinId: position.positionData.upperBinId,
                strategyType: StrategyTypesMap[reinvestStrategy.toLowerCase()]
              },
              user: signer.publicKey,
              slippage: attempt * 2
            });
            await JitoClient.sendTransaction(signer, addLiquidityTx);
            break;
          default:
            break;
        }

        return {
          signature: claimFeeTxSignature,
          tokenXClaimedAmount: position.positionData.feeX,
          tokenYClaimedAmount: position.positionData.feeY
        };
      } catch (error) {
        console.error("Error claim fee", error);
        await sleep(3000);
      }
    }

    throw new Error(`Unsuccessful claim fees for position PK ${positionPublicKey} after ${attempts} attempts`);
  }

  async simpleRebalance( // no swap, just move to active bin
    signer: Keypair,
    poolAddress: string,
    positionPublicKey: string,
    strategy: string,
    attempts: number = 3
  ): Promise<string> {
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        console.log('Start rebalance method', {
          poolAddress,
          positionPublicKey,
          strategy
        })
        const dlmm = await this.getDlmm(poolAddress);
        const position = await dlmm.getPosition(new PublicKey(positionPublicKey));

        await getOrCreateAssociatedTokenAccount(HeliusConnection, signer, dlmm.tokenX.mint.address, signer.publicKey);
        await sleep(1000);
        await getOrCreateAssociatedTokenAccount(HeliusConnection, signer, dlmm.tokenY.mint.address, signer.publicKey);
        await sleep(3000);

        console.log('Run rebalance simulate');

        const simulate = await dlmm.simulateRebalancePositionWithBalancedStrategy(
          new PublicKey(positionPublicKey),
          position.positionData,
          StrategyTypesMap[strategy.toLowerCase()],
          new BN(0),
          new BN(0),
          new BN(0),
          new BN(0),
        )

        const { initBinArrayInstructions, rebalancePositionInstruction } = await dlmm.rebalancePosition(
          simulate,
          new BN(attempt * 2),
          signer.publicKey,
          attempts * 2
        );

        const txs: Transaction[] = []
        let latestBlockHash = await SolanaConnection.getLatestBlockhash();
        initBinArrayInstructions.forEach(instruction => new Transaction({...latestBlockHash}).add(instruction));
        if (txs.length > 0) {
          await JitoClient.sendBundle(signer, txs);
        }

        latestBlockHash = await SolanaConnection.getLatestBlockhash();

        const rebalanceTx = new Transaction({...latestBlockHash}).add(...rebalancePositionInstruction)

        return await JitoClient.sendTransaction(signer, rebalanceTx);
      } catch (error) {
        console.error(`Error rebalancing position ${positionPublicKey}`, error);
        await sleep(1000);
      }
    }
    throw new Error(`Unsuccessful rebalance position after ${attempts} attempts`);
  }

  async standardRebalance( // close active position, swap liquidity+fee 50/50 and open new one
    signer: Keypair,
    poolAddress: string,
    positionPublicKey: string,
    strategy: string,
    attempts: number = 3
  ): Promise<{ openNewPositionSignature: string, closeOldPositionSignature: string, newPositionKeypair: Keypair }> {
    let solAmount: Decimal = new Decimal(0);
    let tokenAmount: Decimal = new Decimal(0);
    let positionIsClosed = false;

    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const dlmm = await this.getDlmm(poolAddress);

        const oldPosition = await dlmm.getPosition(new PublicKey(positionPublicKey));
        if (!oldPosition) {
          throw new Error('Position is not found in blockchain');
        }

        // 1. Close position(also remove liquidity and claim fee)
        const closeOldPositionSignature = await this.closePosition(
          signer,
          poolAddress,
          positionPublicKey,
          false
        );
        positionIsClosed = true;


        // 2. Swap
        const totalXAmount = Decimal(oldPosition.positionData.totalXAmount);
        const totalYAmount = Decimal(oldPosition.positionData.totalYAmount);
        const allLiquidityInX = totalYAmount.isZero() && !totalXAmount.isZero();
        const allLiquidityInY = totalXAmount.isZero() && !totalYAmount.isZero();
        console.log({ allLiquidityInX, allLiquidityInY });

        if (allLiquidityInX) { // all in token, nothing in SOL
          // swap token to SOL
          const totalXAmount = oldPosition.positionData.feeX.add(new BN(oldPosition.positionData.totalXAmount)).div(new BN(2));
          const amount = fromBaseUnits(totalXAmount, dlmm.tokenX.mint.decimals);

          const swapResult = await SolanaMethods.swapToken({
            signer,
            inputMint: dlmm.tokenX.mint.address.toString(),
            outputMint: dlmm.tokenY.mint.address.toString(),
            amount: amount.toString(),
          });

          solAmount = Decimal(swapResult.realOutAmount);
          tokenAmount = Decimal(totalXAmount.toNumber());
        } else if (allLiquidityInY) { // nothing in token, all in SOL
          // swap SOL to token
          const totalYAmount = oldPosition.positionData.feeY.add(new BN(oldPosition.positionData.totalYAmount)).div(new BN(2));
          const amount = fromBaseUnits(totalYAmount, dlmm.tokenY.mint.decimals);

          const swapResult = await SolanaMethods.swapToken({
            signer,
            inputMint: dlmm.tokenY.mint.address.toString(),
            outputMint: dlmm.tokenX.mint.address.toString(),
            amount: amount.toString(),
          });

          solAmount = Decimal(totalYAmount.toNumber());
          tokenAmount = Decimal(swapResult.realOutAmount);
        }


        // 3. Create new position
        const openedPositionResult = await this.createBalancePosition(
          signer,
          poolAddress,
          strategy,
          solAmount,
          tokenAmount
        )

        return {
          openNewPositionSignature: openedPositionResult.signature,
          closeOldPositionSignature,
          newPositionKeypair: openedPositionResult.positionKeypair
        }
      } catch (error) {
        console.error(`${attempt}. Error creating balance position ${positionPublicKey}`, error);
        await sleep(1000);
      }
    }
    throw new Error(`Unsuccessful rebalance position after ${attempts} attempts.${positionIsClosed ? ' Position was closed' : ''}`);
  }

  async positionIsInRange(poolAddress: string, positionPublicKey: string): Promise<boolean> {
    const dlmm = await this.getDlmm(poolAddress);
    const pos = await dlmm.getPosition(new PublicKey(positionPublicKey));

    const { binId: activeBin } = await dlmm.getActiveBin();

    const low  = Number(pos.positionData.lowerBinId);
    const high = Number(pos.positionData.upperBinId);
    const mid  = Number(activeBin);

    // guard against inverted ranges, just in case
    const min = Math.min(low, high);
    const max = Math.max(low, high);

    return min <= mid && mid <= max;
  }
}
