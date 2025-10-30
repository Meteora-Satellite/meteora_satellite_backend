import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { SiwsMessageType } from "./types";

export function formatSiwsMessage(m: SiwsMessageType): string {
  const header = `${m.domain} wants you to sign in with your Solana account:\n${m.address}`;
  const body = `${m.statement}`;
  const uri = `URI: ${m.domain}`;
  const issuedAt = `Issued At: ${m.issuedAt}`;
  const nonce = `Nonce: ${m.nonce}`;
  const exp = `\nExpiration Time: ${m.expirationTime}`;
  return `${header}\n\n${body}\n\n${uri}\n${issuedAt}\n${nonce}${exp}`;
}

export function verifySignature(message: string, signatureB58: string, addressB58: string): boolean {
  const sig = bs58.decode(signatureB58);
  const pub = bs58.decode(addressB58);
  const msgBytes = new TextEncoder().encode(message);
  return nacl.sign.detached.verify(msgBytes, sig, pub);
}
