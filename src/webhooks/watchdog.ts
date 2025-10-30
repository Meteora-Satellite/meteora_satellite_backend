import PositionService from "@modules/positions/positions.service";
import TriggerEngine from "./trigger-engine";
import MeteoraClient from "../meteora/index";
import { getSignerForUser } from "../solana/utils";
import NotificationService from "@modules/notifications/notifications.service";
import { NotificationType } from "@common/types";

const PRICE_PERIOD_MS = 30_000;
const CLAIM_PERIOD_MS = 60_000;
const JITTER_FRAC = 0.10; // ±10%

export default class Watchdog {
  // master on/off
  private static stopped = true;

  // per-lane state
  private static price = { running: false, timer: null as NodeJS.Timeout | null };
  private static claim = { running: false, timer: null as NodeJS.Timeout | null };

  static start() {
    if (!this.stopped) return;
    this.stopped = false;
    this.scheduleNext("price", 0);
    this.scheduleNext("claim", 0);
    console.log(`[Watchdog] started (price~${PRICE_PERIOD_MS}ms, claim~${CLAIM_PERIOD_MS}ms)`);
  }

  static stop() {
    this.stopped = true;
    if (this.price.timer) clearTimeout(this.price.timer);
    if (this.claim.timer) clearTimeout(this.claim.timer);
    this.price.timer = this.claim.timer = null;
  }

  // lane scheduler
  private static scheduleNext(lane: "price" | "claim", delay: number) {
    if (this.stopped) return;
    const ref = lane === "price" ? this.price : this.claim;
    if (ref.timer) clearTimeout(ref.timer);
    ref.timer = setTimeout(() => {
      lane === "price" ? this.tickPrice().catch(console.error)
        : this.tickClaim().catch(console.error);
    }, Math.max(5_000, delay));
  }

  // ----- PRICE lane -----
  private static async tickPrice() {
    if (this.stopped) return;
    if (this.price.running) return this.scheduleNext("price", this.randomDelay(PRICE_PERIOD_MS));
    this.price.running = true;

    try {
      const poolIds = await this.listActivePoolIds();
      for (const poolId of poolIds) {
        try {
          const tokensPerSOL = await MeteoraClient.getTokenPriceFromPool(poolId);
          await TriggerEngine.onPoolPrice({ poolId, tokensPerSOL });
        } catch (e) {
          console.error(`[Watchdog/price] tick failed for ${poolId}:`, e);
        }
      }
    } finally {
      this.price.running = false;
      this.scheduleNext("price", this.randomDelay(PRICE_PERIOD_MS));
    }
  }

  // ----- CLAIM lane -----
  private static async tickClaim() {
    if (this.stopped) return;
    if (this.claim.running) return this.scheduleNext("claim", this.randomDelay(CLAIM_PERIOD_MS));
    this.claim.running = true;

    try {
      await this.claimFeesWhenDue();
    } finally {
      this.claim.running = false;
      this.scheduleNext("claim", this.randomDelay(CLAIM_PERIOD_MS));
    }
  }

  private static randomDelay(base: number) {
    const jitter = base * JITTER_FRAC * (Math.random() * 2 - 1);
    return Math.round(base + jitter);
  }

  private static async listActivePoolIds(): Promise<string[]> {
    const positions = await PositionService.getAllActivePositions();
    return Array.from(new Set(positions.map(p => p.poolId)));
  }

  /** New: claim fees loop */
  private static async claimFeesWhenDue() {
    const positions = await PositionService.getPositionsWithFeesEnabled();
    for (const position of positions) {
      if (!position.feesConfig) continue;
      const intervalMinutes = position.feesConfig.interval ?? 0;
      if (!intervalMinutes || intervalMinutes <= 0) return;

      const feesConfig = position.feesConfig;
      const nowMs = Date.now();
      const last = feesConfig.lastClaimedAt ? new Date(feesConfig.lastClaimedAt).getTime() : 0;
      const intervalMs = intervalMinutes * 60_000;

      if (nowMs - last < intervalMs) return;

      try {
        const signer = await getSignerForUser(position.userId);
        const claimFeesResult = await MeteoraClient.claimFees(
          signer,
          position.poolId,
          position.onchain.positionPubkey,
          feesConfig.mode,
          feesConfig.reinvestStrategy
        );
        await PositionService.updatePositionLastClaimedAtFees(position._id);

        await NotificationService.create({
          userId: position.userId,
          title: `Fees claimed.`,
          body: `Fees for position ${position._id.toString()} were successfully claimed with mode ${feesConfig.mode}!`,
          type: NotificationType.feeClaim,
          data: {
            transactionSignature: claimFeesResult.signature,
            positionId: position._id.toString()
          }
        });
      } catch (err) {
        console.error(`[Watchdog] claim failed for position=${position._id}:`, err);
      }
    }
  }
}
