import PoolListener from "../webhooks/pool-listener";
import Watchdog from "../webhooks/watchdog";
import { listActivePoolIds } from "./utils";

export async function startWebhooks() {
  const poolIds = await listActivePoolIds();

  for (const poolId of poolIds) {
    await PoolListener.subscribePool(poolId);
  }

  Watchdog.start();
}
