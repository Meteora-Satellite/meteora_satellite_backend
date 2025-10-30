import { Connection } from "@solana/web3.js";
import { env } from "@config";
import { SOLANA_COMMITMENT } from "@common/constants";

export default new Connection(env.HELIUS_RPC_URL, SOLANA_COMMITMENT);
console.log('[HELIUS_RPC_URL] Connected to RPC:', env.HELIUS_RPC_URL);
