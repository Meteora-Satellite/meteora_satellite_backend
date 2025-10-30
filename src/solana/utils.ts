import {
  Keypair,
  PublicKey,
} from "@solana/web3.js";
import {
  getMint,
  TOKEN_PROGRAM_ID
} from "@solana/spl-token";
import {
  WSOL_DECIMALS,
  WSOL_MINT
} from "@common/constants";
import SolanaConnection from './index';
import bs58 from "bs58";
import nacl from "tweetnacl";
import type {
  ISecretBox,
  IWallet
} from "@modules/wallets/Wallet.model";
import { decryptAesGcm } from "@common//secret-box";
import { WalletService } from "@modules/wallets/wallets.service";
import { Types } from "mongoose";

export function toBaseUnits(human: string, decimals: number): string {
  const [i, f = ""] = human.split(".");
  const frac = (f + "0".repeat(decimals)).slice(0, decimals);
  // return as decimal string to avoid bigint in JSON
  return (BigInt(i || "0") * BigInt(10) ** BigInt(decimals) + BigInt(frac || "0")).toString();
}

// Detect mint decimals
export async function getDecimals(mint: string): Promise<number> {
  if (mint === WSOL_MINT.toString()) return WSOL_DECIMALS;
  const info = await getMint(SolanaConnection, new PublicKey(mint), "confirmed", TOKEN_PROGRAM_ID);
  return info.decimals;
}

function parseEd25519SecretKey(raw: Buffer | string): Uint8Array {
  // If it looks like JSON array: [12,34,...]
  if (typeof raw === "string" && raw.trim().startsWith("[")) {
    const arr = JSON.parse(raw) as number[];
    const bytes = Uint8Array.from(arr);
    if (bytes.length !== 64 && bytes.length !== 32) {
      throw new Error(`Unexpected key length from JSON: ${bytes.length}`);
    }
    return bytes.length === 64 ? bytes : nacl.sign.keyPair.fromSeed(bytes).secretKey;
  }

  // Try base58
  if (typeof raw === "string") {
    try {
      const b58 = bs58.decode(raw);
      if (b58.length === 64) return b58;
      if (b58.length === 32) return nacl.sign.keyPair.fromSeed(b58).secretKey;
    } catch (_) {}
  }

  // Try base64
  if (typeof raw === "string") {
    try {
      const b64 = Buffer.from(raw, "base64");
      if (b64.length === 64) return new Uint8Array(b64);
      if (b64.length === 32) return nacl.sign.keyPair.fromSeed(new Uint8Array(b64)).secretKey;
    } catch (_) {}
  }

  // Try hex
  if (typeof raw === "string" && /^[0-9a-fA-F]+$/.test(raw) && raw.length % 2 === 0) {
    const hex = Buffer.from(raw, "hex");
    if (hex.length === 64) return new Uint8Array(hex);
    if (hex.length === 32) return nacl.sign.keyPair.fromSeed(new Uint8Array(hex)).secretKey;
  }

  // Raw bytes (Buffer)
  if (Buffer.isBuffer(raw)) {
    if (raw.length === 64) return new Uint8Array(raw);
    if (raw.length === 32) return nacl.sign.keyPair.fromSeed(new Uint8Array(raw)).secretKey;
  }

  throw new Error("Unsupported private key format; expected 32-byte seed or 64-byte secret key.");
}

// Decrypts the wallet secret (AES-GCM box) and returns a Keypair (Signer).
export function privateKeyFromWallet(wallet: Pick<IWallet, "kind" | "secret" | "address">): Uint8Array {
  if (wallet.kind !== "custodial") {
    throw new Error("Cannot create signer for external wallet.");
  }
  if (!wallet.secret) {
    throw new Error("Wallet has no secret payload.");
  }

  const { iv, ct, tag } = wallet.secret as ISecretBox;
  const plaintext = decryptAesGcm({ iv, ct, tag });

  let secretStr: string | Buffer;
  try {
    const s = plaintext.toString("utf8");
    const printable = /^[\x09\x0A\x0D\x20-\x7E\[\],0-9a-fA-F"+=]+$/; // covers json, b58, b64, hex
    secretStr = printable.test(s) ? s.trim() : plaintext;
  } catch {
    secretStr = plaintext;
  }

  return parseEd25519SecretKey(secretStr);
}

export async function getSignerForUser(userId: string | Types.ObjectId) {
  const wallet = await WalletService.findCustodialByUser(userId);
  if (!wallet) {
    throw new Error(`Custodial wallet not found for user ${userId}.`);
  }

  const secretKey = privateKeyFromWallet(wallet);
  return Keypair.fromSecretKey(secretKey);
}