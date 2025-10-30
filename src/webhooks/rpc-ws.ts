import WebSocket from "ws";
import { env } from "@config";
import { SOLANA_COMMITMENT } from "@common/constants";

type JsonRpcReq = {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: any[];
};

type AccountNotification = {
  method: "accountNotification";
  params: {
    subscription: number;
    result: {
      context: { slot: number };
      value: {
        data: [string, "base64"];
      };
    };
  };
};

const DEFAULT_HEARTBEAT_MS = 15_000;
const DEFAULT_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;

export class RpcWs {
  private ws: WebSocket | null = null;
  private nextId = 1;
  private pending = new Map<number, (res: any) => void>();

  // key = accountPubkey → { subId? }
  private subs = new Map<string, { subId?: number }>();

  private backoff = DEFAULT_BACKOFF_MS;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private alive = false;
  private stopped = false;

  /**
   * Fires when the subscribed account changes.
   * Buffer is the raw decoded base64 payload from the notification.
   */
  onAccountChange?: (pubkey: string, slot: number, buf: Buffer) => void;

  start() {
    this.stopped = false;
    this.connect();
  }

  stop() {
    this.stopped = true;
    this.clearHeartbeat();
    try {
      this.ws?.close();
    } catch {}
    this.ws = null;
  }

  isConnected() {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  async subscribeAccount(pubkey: string) {
    // Store intent; actual subscribe happens once connected
    if (!this.subs.has(pubkey)) this.subs.set(pubkey, {});
    if (this.isConnected()) {
      await this.sendAccountSubscribe(pubkey);
    }
  }

  async unsubscribeAccount(pubkey: string) {
    const rec = this.subs.get(pubkey);
    if (!rec) return;
    if (this.isConnected() && rec.subId != null) {
      await this.call("accountUnsubscribe", [rec.subId]).catch(() => {});
    }
    this.subs.delete(pubkey);
  }

  private connect() {
    if (this.ws) return;
    const ws = new WebSocket(env.SOLANA_RPC_WEBHOOK_URL, { perMessageDeflate: false });
    this.ws = ws;

    ws.on("open", () => {
      this.backoff = DEFAULT_BACKOFF_MS;
      this.setupHeartbeat(ws);
      this.resubscribeAll().catch(console.error);
      console.log(`[RpcWs] connected → ${env.SOLANA_RPC_WEBHOOK_URL}`);
    });

    ws.on("pong", () => {
      this.alive = true;
    });

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(String(data));
        this.handleMessage(msg);
      } catch (e) {
        console.error("[RpcWs] parse error:", e);
      }
    });

    ws.on("error", (err) => {
      console.error("[RpcWs] error:", err?.message || err);
    });

    ws.on("close", () => {
      this.clearHeartbeat();
      this.ws = null;
      // resolve all pending to avoid leaks
      for (const [, resolve] of this.pending) resolve(null);
      this.pending.clear();
      if (!this.stopped) this.scheduleReconnect();
    });
  }

  private scheduleReconnect() {
    const jitter = this.backoff * 0.2 * (Math.random() * 2 - 1); // ±20%
    const delay = Math.min(MAX_BACKOFF_MS, Math.max(500, this.backoff + jitter));
    setTimeout(() => this.connect(), Math.round(delay));
    this.backoff = Math.min(MAX_BACKOFF_MS, this.backoff * 2);
    console.log(`[RpcWs] reconnect in ${Math.round(delay)}ms`);
  }

  private setupHeartbeat(ws: WebSocket) {
    this.clearHeartbeat();
    this.alive = true;
    this.heartbeatTimer = setInterval(() => {
      if (!this.alive) {
        try {
          ws.terminate();
        } catch {}
        return;
      }
      this.alive = false;
      try {
        ws.ping();
      } catch {}
    }, DEFAULT_HEARTBEAT_MS);
  }

  private clearHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private async resubscribeAll() {
    for (const [pubkey] of this.subs) {
      await this.sendAccountSubscribe(pubkey);
    }
  }

  private async sendAccountSubscribe(pubkey: string) {
    const res = await this.call("accountSubscribe", [
      pubkey,
      {
        encoding: "base64",
        commitment: SOLANA_COMMITMENT,
      },
    ]);
    if (res && typeof res.result === "number") {
      const rec = this.subs.get(pubkey);
      if (rec) rec.subId = res.result;
      console.log(`[RpcWs] subscribed ${pubkey} → ${res.result}`);
    } else {
      console.warn(`[RpcWs] subscribe failed for ${pubkey}`, res);
    }
  }

  private handleMessage(msg: any) {
    // Responses to our requests
    if (typeof msg.id === "number") {
      const fn = this.pending.get(msg.id);
      if (fn) {
        this.pending.delete(msg.id);
        fn(msg);
      }
      return;
    }

    // Account notifications
    if (msg.method === "accountNotification") {
      const n = msg as AccountNotification;
      const subId = n.params.subscription;
      const slot = n.params.result.context.slot;
      const [b64] = n.params.result.value.data;
      const buf = Buffer.from(b64, "base64");

      for (const [pubkey, rec] of this.subs) {
        if (rec.subId === subId) {
          this.onAccountChange?.(pubkey, slot, buf);
          break;
        }
      }
    }
  }

  private call(method: string, params?: any[]) {
    return new Promise<any>((resolve) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return resolve(null);
      const id = this.nextId++;
      const payload: JsonRpcReq = { jsonrpc: "2.0", id, method, params };
      this.pending.set(id, resolve);
      try {
        this.ws.send(JSON.stringify(payload));
      } catch {
        this.pending.delete(id);
        return resolve(null);
      }
      setTimeout(() => {
        const fn = this.pending.get(id);
        if (fn) {
          this.pending.delete(id);
          fn(null);
        }
      }, 10_000);
    });
  }
}
