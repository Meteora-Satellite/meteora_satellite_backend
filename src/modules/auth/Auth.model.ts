import { Schema, model } from 'mongoose';

export interface IAuthChallenge {
  _id: string;
  address: string;
  nonce: string;
  domain: string;
  message: string;
  issuedAt: Date;
  expiresAt: Date;
  usedAt?: Date | null;
}

const AuthChallengeSchema = new Schema<IAuthChallenge>({
  address: { type: String, index: true, required: true },
  nonce: { type: String, required: true },
  domain: { type: String, required: true },
  message: { type: String, required: true },
  issuedAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
  usedAt: { type: Date, default: null }
}, { timestamps: true });

export const AuthChallenge = model<IAuthChallenge>('AuthChallenge', AuthChallengeSchema);
