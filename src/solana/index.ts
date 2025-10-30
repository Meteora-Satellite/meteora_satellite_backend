import { Connection } from "@solana/web3.js";
import { env } from "@config";
import { SOLANA_COMMITMENT } from "@common/constants";

export default new Connection(env.SOLANA_RPC_URL, SOLANA_COMMITMENT);
console.log('[SOLANA] Connected to RPC:', env.SOLANA_RPC_URL);
