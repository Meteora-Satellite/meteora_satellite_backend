import { Schema } from "mongoose";
import { ISecretBox } from "@modules/wallets/Wallet.model";

export const SecretBoxSchema = new Schema<ISecretBox>({
  alg: { type: String, required: true },
  iv:  { type: String, required: true },
  ct:  { type: String, required: true },
  tag: { type: String, required: true },
  kid: { type: String }
}, { _id: false });
