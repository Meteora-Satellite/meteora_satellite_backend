import { RpcWs } from "./rpc-ws";
import MeteoraClient from "../meteora/index";
import TriggerEngine from "./trigger-engine";

class PoolListener {
  private static client: RpcWs | null = null;
  private static subs = new Set<string>();

  static start() {
    if (this.client) return;
    this.client = new RpcWs();

    this.client.onAccountChange = async (poolId, _slot, _buf) => {
      try {
        const tokensPerSOL = await MeteoraClient.getTokenPriceFromPool(poolId);
        await TriggerEngine.onPoolPrice({ poolId, tokensPerSOL });
      } catch (e) {
        console.error(`[PoolListener] onAccountChange failed for ${poolId}:`, e);
      }
    };

    this.client.start();
    console.log(`[PoolListener] WS started`);
  }

  static stop() {
    if (!this.client) return;
    this.client.stop();
    this.client = null;
    this.subs.clear();
  }

  static async subscribePool(poolId: string) {
    this.start();
    if (!this.client || this.subs.has(poolId)) {
      return;
    }
    await this.client.subscribeAccount(poolId);
    this.subs.add(poolId);
    console.log(`[PoolListener] subscribed ${poolId}`);
  }

  static async unsubscribePool(poolId: string) {
    if (!this.client || !this.subs.has(poolId)) return;
    await this.client.unsubscribeAccount(poolId);
    this.subs.delete(poolId);
    console.log(`[PoolListener] unsubscribed ${poolId}`);
  }
}

export default PoolListener;
