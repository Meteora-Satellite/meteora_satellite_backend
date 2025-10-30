import {
  LAMPORTS_PER_SOL,
  PublicKey,
  VersionedTransaction
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID
} from '@solana/spl-token';
import SolanaConnection from './index';
import { trimNumStr } from "@modules/auth/utils";
import {
  JupiterSwapOrderResponse,
  SwapTokenInput,
  SwapTokenResult
} from "@common/types";
import {
  getDecimals,
  toBaseUnits
} from "./utils";
import { env } from "@config";
import { WSOL_MINT } from "@common/constants";

export default class SolanaMethods {
  static async getWalletBalances(address: string, onlySol: boolean = false): Promise<{ solana: string; tokens: Record<string, string> }> {
    const owner = new PublicKey(address);

    // SOL
    const lamports = await SolanaConnection.getBalance(owner);
    const solStr = trimNumStr((lamports / LAMPORTS_PER_SOL).toFixed(9));

    if (onlySol) {
      return { solana: solStr, tokens: {} };
    }

    // SPL tokens (parsed)
    const resp = await SolanaConnection.getParsedTokenAccountsByOwner(owner, {
      programId: TOKEN_PROGRAM_ID
    });

    const tokens: Record<string, string> = {};
    for (const { pubkey, account } of resp.value) {
      const parsed = (account.data as any).parsed?.info;
      const tokenAmount = parsed?.tokenAmount as
        | { amount: string; decimals: number; uiAmountString?: string | null }
        | undefined;

      // Skip zero balances
      if (!tokenAmount || tokenAmount.amount === '0') continue;

      const tokenAccount = pubkey.toBase58();
      tokens[tokenAccount] = tokenAmount.uiAmountString ?? '0';
    }

    return { solana: solStr, tokens };
  }

  static async getTokenSwapRealAmount(signature: string, owner: string, mint: string): Promise<string | null> {
    try {
      const tx = await SolanaConnection.getParsedTransaction(signature, {
        maxSupportedTransactionVersion: 0,
      });

      if (!tx?.meta) throw new Error("Transaction not found or meta missing");
      const meta = tx.meta;

      // --- SOL branch ---
      if (mint === WSOL_MINT.toString()) {
        const msg = tx.transaction.message as any;
        const keys: string[] = (msg.accountKeys ?? msg.staticAccountKeys).map((k: any) =>
          (k.pubkey ? k.pubkey : k).toBase58()
        );
        const i = keys.indexOf(owner);
        if (i < 0) throw new Error("Owner not in account keys");
        const pre = meta.preBalances?.[i] ?? 0;
        const post = meta.postBalances?.[i] ?? 0;
        return (post - pre).toString();
      }

      // --- SPL token branch ---
      const sum = (
        arr: NonNullable<typeof meta.preTokenBalances | typeof meta.postTokenBalances>
      ) => {
        let total = 0n;
        for (const b of arr ?? []) {
          if (!b) continue;
          if (b.mint !== mint) continue;
          if (b.owner !== owner) continue;
          total += BigInt(b.uiTokenAmount.amount ?? "0");
        }
        return total;
      };

      const pre = sum(meta.preTokenBalances ?? []);
      const post = sum(meta.postTokenBalances ?? []);

      const delta = post - pre; // raw units
      return delta > 0 ? delta.toString() : null;
    } catch (e) {
      console.log('Error getting token swap real amount', e);
      return null;
    }
  }

  static async generateSwapTx(
    input: SwapTokenInput
  ): Promise<{ vtx: VersionedTransaction, order: JupiterSwapOrderResponse }> {
    const { signer, inputMint, outputMint, amount } = input;
    console.log('Swap token initialized:', { inputMint, outputMint, amount });

    // TODO update this to receive in "input" tokens already in base units
    const inDecimals = await getDecimals(inputMint);
    const amountAtoms = toBaseUnits(amount, inDecimals);

    const params = new URLSearchParams({
      inputMint,
      outputMint,
      amount: amountAtoms,
      taker: signer.publicKey.toString(),
    });

    const orderRes = await fetch(`https://api.jup.ag/ultra/v1/order?${params.toString()}`, {
      method: "GET",
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.JUPITER_API_KEY
      },
    });

    if (!orderRes.ok) {
      const text = await orderRes.text();
      throw new Error(`Ultra order failed: ${orderRes.status} ${text}`);
    }

    const order = await orderRes.json() as JupiterSwapOrderResponse;

    // If taker was provided and transaction is empty string, there’s a user-side error (eg insufficient funds)
    if (order.transaction === "") {
      throw new Error(`Ultra order error: ${order.errorMessage || `code ${order.errorCode}`}`);
    }
    if (!order.transaction) {
      throw new Error("Ultra did not return a transaction (taker may be null?)");
    }

    // 3) decode to VersionedTransaction and sign
    const unsigned = Buffer.from(order.transaction, "base64");
    return { vtx: VersionedTransaction.deserialize(unsigned), order };
  }

  static async swapToken(input: SwapTokenInput): Promise<SwapTokenResult> {
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        const {vtx, order} = await this.generateSwapTx(input);
        vtx.sign([input.signer]);

        const signedB64 = Buffer.from(vtx.serialize()).toString("base64");

        // 4) POST /ultra/v1/execute
        const execRes = await fetch("https://api.jup.ag/ultra/v1/execute", {
          method: "POST",
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': env.JUPITER_API_KEY
          },
          body: JSON.stringify({
            signedTransaction: signedB64,
            requestId: order.requestId,
          }),
        });

        if (!execRes.ok) {
          const text = await execRes.text();
          throw new Error(`Ultra execute failed: ${execRes.status} ${text}`);
        }

        const exec = await execRes.json() as {
          status: "Success" | "Failed";
          signature?: string;
          error?: string;
          code?: number;
        };

        if (exec.status !== "Success" || !exec.signature) {
          throw new Error(`Ultra execute error: ${exec.error || exec.code || "unknown"}`);
        }

        // we need to do this, coz Jupiter return wrong "outAmount", coz slippage
        const realOutAmount = await this.getTokenSwapRealAmount(
          exec.signature,
          input.signer.publicKey.toString(),
          input.outputMint
        );

        console.log('✅Token swap success:', {
          signature: exec.signature,
          inputMint: input.inputMint,
          outputMint: input.outputMint,
          inAmount: order.inAmount,
          outAmount: order.outAmount,
          realOutAmount: realOutAmount ?? order.outAmount,
          priceImpact: order.priceImpact,
        });

        return {
          signature: exec.signature,
          outAmount: order.outAmount,
          realOutAmount: realOutAmount ?? order.outAmount,
        };
      } catch (e) {
        console.log(`${attempt}. ❌Token swap failed:`, e);
      }
    }
    throw new Error("Token swap failed after max retries");
  }
}
