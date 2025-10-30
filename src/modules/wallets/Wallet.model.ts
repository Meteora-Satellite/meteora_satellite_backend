import { Schema, model, Types } from 'mongoose';
import { WalletKindType } from "@common/types";
import { SecretBoxSchema } from "@common/schemas";
import { WALLET_KINDS } from "@common/constants";

export interface ISecretBox { alg: "aes-128-gcm" | "aes-192-gcm" | "aes-256-gcm"; iv: string; ct: string; tag: string; kid?: string; }

export interface IWallet {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  address: string;                         // base58
  kind: WalletKindType;                        // 'external' or 'custodial'
  secret?: ISecretBox | null;              // only for custodial
  lastConnectedAt?: Date;                  // for external
  loginCount?: number;                     // for external
  createdAt: Date; updatedAt: Date;
}

const WalletSchema = new Schema<IWallet>({
  userId:  { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  address: { type: String, required: true, unique: true, index: true }, // 1 address = 1 wallet (global)
  kind:    { type: String, enum: WALLET_KINDS, required: true },
  secret:  { type: SecretBoxSchema, default: null },
  lastConnectedAt: { type: Date },
  loginCount: { type: Number, default: 0 }
}, { timestamps: true });

WalletSchema.index({ userId: 1, kind: 1 });

export const Wallet = model<IWallet>('Wallet', WalletSchema);
