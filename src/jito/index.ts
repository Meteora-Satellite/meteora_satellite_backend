import {
  Transaction,
  SystemProgram,
  PublicKey,
  Keypair,
  VersionedTransaction,
  TransactionMessage,
} from "@solana/web3.js";
import { env } from "@config";
import {
  backoff,
  sleep
} from "@common/utils";
import SolanaConnection from "../solana/index";

type JsonRpcReq = {
  id: number;
  jsonrpc: "2.0";
  method: string;
  params?: any[];
};

export default new class JitoClient {
  // cache for tip accounts + rotation
  private tipAccounts: string[] = [];
  private sendCounter = 0;
  private beIndex = 0;

  private beUrls: string[] = env.JITO_BE_URLS
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);

  private nextBaseUrl() {
    if (!this.beUrls.length) throw new Error("No Jito Block Engine URLs configured");
    this.beIndex = (this.beIndex + 1) % this.beUrls.length;
    return this.beUrls[this.beIndex];
  }

  private currentBaseUrl() {
    if (!this.beUrls.length) throw new Error("No Jito Block Engine URLs configured");
    return this.beUrls[this.beIndex] ?? this.beUrls[0];
  }

  private async rpc<T = any>(path: string, body: JsonRpcReq, extraQuery = ""): Promise<T> { // TODO update types
    let attempt = 1;
    let lastErr: any;
    const maxAttempts = 5;
    const baseDelayMs = 300;
    const maxDelayMs = 8000;

    while (attempt <= maxAttempts) {
      try {
        const url = new URL(this.currentBaseUrl() + path + extraQuery);

        const headers: Record<string, string> = { "Content-Type": "application/json" };

        const res = await fetch(url.toString(), {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        });
        this.sendCounter++;

        if (!res.ok) throw new Error(`Jito RPC ${body.method} failed: ${res.status} ${await res.text()}`);
        const json: any = await res.json();
        if ("error" in json) throw new Error(`Jito RPC error: ${JSON.stringify(json.error)}`);
        return json;
      } catch (e: any) {
        lastErr = e;

        // Detect 429 / -32097 and apply special handling
        const is429 = /429/.test(e.message) || /-32097/.test(e.message) || /rate/i.test(e.message);
        if (!is429 || attempt === maxAttempts) break;

        // Rotate BE region
        const oldBe = this.currentBaseUrl();
        const newBe = this.nextBaseUrl();
        console.warn(`Jito 429 (attempt ${attempt}) — rotating BE: ${oldBe} → ${newBe}`);

        // Backoff with jitter
        const delay = backoff(attempt, baseDelayMs, maxDelayMs);
        await sleep(delay);
        attempt++;
      }
    }
    throw new Error(`Jito RPC failed after ${maxAttempts} attempts: ${lastErr?.message ?? lastErr}`);
  }

  async sendTransaction(
    sender: Keypair,
    tx: Transaction,
    signers: Keypair[] = [],
    jitoTipLamports: number = 100_000 // 0.0001 SOL
  ): Promise<string> {
    try {
      console.log('Send Jito transaction');
      const tipAccount = await this.pickTipAccountWithRotation();

      const tipIx = SystemProgram.transfer({
        fromPubkey: sender.publicKey,
        toPubkey: new PublicKey(tipAccount),
        lamports: jitoTipLamports,
      });
      tx = tx.add(tipIx);

      signers.push(sender);
      tx.sign(...signers);

      const simulateJitoTx = await SolanaConnection.simulateTransaction(tx);
      if (simulateJitoTx.value.err) {
        throw new Error(`Simulate Jito transaction error: ${simulateJitoTx.value.err}`);
      }

      const raw = tx.serialize();
      const b64 = Buffer.from(raw).toString("base64");

      const body: JsonRpcReq = {
        id: Date.now(),
        jsonrpc: "2.0",
        method: "sendTransaction",
        params: [b64, {encoding: 'base64'}],
      };

      const json = await this.rpc<{ result: string }>("/api/v1/transactions", body);
      const jitoTxSignature = json.result;

      while (true) { // TODO move this to a common "confirm transaction" method
        await sleep(500);
        const jitoTxSignatureStatus = await SolanaConnection.getSignatureStatus(jitoTxSignature);

        if (jitoTxSignatureStatus.value?.err) {
          throw new Error(`Jito tx signature - ${jitoTxSignature} status error: ${jitoTxSignatureStatus.value.err}`);
        }

        if (jitoTxSignatureStatus.value?.confirmationStatus == 'confirmed') {
          if (jitoTxSignatureStatus.value.confirmations && jitoTxSignatureStatus.value.confirmations > 10) {
            break;
          }
        }
      }

      return json.result;
    } catch (e) {
      console.log('Send Jito transaction failed', e);
      throw e;
    }
  }

  /** Fetch the current list of tip accounts from the Block Engine. */
  private async getTipAccounts(): Promise<string[]> {
    const body: JsonRpcReq = {
      id: Date.now(),
      jsonrpc: "2.0",
      method: "getTipAccounts",
      params: [],
    };
    const json = await this.rpc<{ result: string[] }>("/api/v1/getTipAccounts", body);
    return json.result;
  }

  /**
   * Send a bundle (1..5 txs), atomic. Include a tip transfer in one tx of the bundle.
   */
  async sendBundle(
    signer: Keypair,
    txs: (Transaction | VersionedTransaction)[],
    jitoTipLamports: number = 100_000 // 0.0001 SOL
  ): Promise<string> {
    if (!txs.length || txs.length > 5) {
      throw new Error(`Bundle must contain between 1 and 5 transactions. Actual length - ${txs.length}`);
    }

    const tipAccountStr = await this.pickTipAccountWithRotation();
    if (!tipAccountStr) throw new Error("No Jito tip account available");
    const tipAccount = new PublicKey(tipAccountStr);

    const hasLegacy = txs.some(t => t instanceof Transaction);

    let bundle: (Transaction | VersionedTransaction)[] = [];

    if (txs.length < 5) {
      // Prepend standalone v0 tip tx
      const tipV0 = await this.buildTipV0Tx(signer, tipAccount, jitoTipLamports);
      bundle = [tipV0, ...txs];
    } else {
      if (hasLegacy) {
        // Inject tip into the first legacy tx
        const firstLegacyIndex = txs.findIndex(t => t instanceof Transaction);
        const legacy = txs[firstLegacyIndex] as Transaction;

        legacy.add(SystemProgram.transfer({
          fromPubkey: signer.publicKey,
          toPubkey: tipAccount,
          lamports: jitoTipLamports,
        }));

        bundle = txs.slice(); // keep order; tip will be inside that legacy tx
      } else {
        throw new Error(
          "Bundle has 5 versioned transactions and no legacy tx to carry a tip. " +
          "Reduce txs to ≤4 so a standalone tip tx can be added, or rebuild one as legacy to inject the tip."
        );
      }
    }

    // Sign and simulate all
    for (const tx of bundle) {
      // Sign (harmless if already signed)
      if (tx instanceof VersionedTransaction) {
        tx.sign([signer]);
        const sim = await SolanaConnection.simulateTransaction(tx, {
          sigVerify: false,
          replaceRecentBlockhash: true,
        });
        if (sim.value.err) {
          throw new Error(`Simulate v0 tx error: ${JSON.stringify(sim.value.err)}`);
        }
      } else {
        // Legacy
        tx.sign(signer);
        const sim = await SolanaConnection.simulateTransaction(tx);
        if (sim.value.err) {
          throw new Error(`Simulate legacy tx error: ${JSON.stringify(sim.value.err)}`);
        }
      }
    }

    // Encode and send bundle
    const encoded = bundle.map(t => Buffer.from((t as any).serialize()).toString("base64"));

    const body: JsonRpcReq = {
      id: Date.now(),
      jsonrpc: "2.0",
      method: "sendBundle",
      params: [encoded, { encoding: "base64" }],
    };

    const json = await this.rpc<{ result: string }>("/api/v1/bundles", body);
    console.log(json)

    return json.result;
  }

  async buildTipV0Tx(
    signer: Keypair,
    tipAccount: PublicKey,
    lamports: number
  ): Promise<VersionedTransaction> {
    const { blockhash } = await SolanaConnection.getLatestBlockhash("processed");
    const ix = SystemProgram.transfer({
      fromPubkey: signer.publicKey,
      toPubkey: tipAccount,
      lamports,
    });
    const msg = new TransactionMessage({
      payerKey: signer.publicKey,
      recentBlockhash: blockhash,
      instructions: [ix],
    }).compileToV0Message();
    const vtx = new VersionedTransaction(msg);
    vtx.sign([signer]);
    return vtx;
  }

  /**
   * Choose a tip account, refreshing the list every 50 sends.
   */
  private async pickTipAccountWithRotation(): Promise<string> {
    if (!this.tipAccounts.length || this.sendCounter % 50 === 0) {
      try {
        this.tipAccounts = await this.getTipAccounts();
      } catch (error) {
        console.log('Tip accounts getting error', error); // TODO add static tipAccounts to env for this cases
      }
    }
    return this.tipAccounts[Math.floor(Math.random() * this.tipAccounts.length)];
  }
}
