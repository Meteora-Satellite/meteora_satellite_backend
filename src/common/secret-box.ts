import crypto from "crypto";
import { env } from "@config";

export function encryptAesGcm(plaintext: Buffer) {
  const iv = crypto.randomBytes(12);
  const key = Buffer.from(env.MASTER_KEY_B64.trim(), "base64");
  const cipher = crypto.createCipheriv(env.CRYPTO_ALGORITHM, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    alg: env.CRYPTO_ALGORITHM,
    iv: iv.toString("base64"),
    ct: ct.toString("base64"),
    tag: tag.toString("base64"),
  };
}

export function decryptAesGcm(box: { iv: string; ct: string; tag: string }) {
  const iv = Buffer.from(box.iv, "base64");
  const ct = Buffer.from(box.ct, "base64");
  const tag = Buffer.from(box.tag, "base64");
  const key = Buffer.from(env.MASTER_KEY_B64.trim(), "base64"); // ← FIX
  const decipher = crypto.createDecipheriv(env.CRYPTO_ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}
