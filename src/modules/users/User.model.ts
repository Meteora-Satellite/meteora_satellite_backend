import { Schema, model, Types } from 'mongoose';

export interface IUser {
  _id: Types.ObjectId;
  roles: string[];
  connectedWallet?: Types.ObjectId | null;   // Wallet(kind='external')
  primaryWallet?: Types.ObjectId | null;     // Wallet(kind='custodial')
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>({
  roles: { type: [String], default: ['user'] },
  connectedWallet: { type: Schema.Types.ObjectId, ref: 'Wallet', default: null, index: true, unique: true, sparse: true },
  primaryWallet:   { type: Schema.Types.ObjectId, ref: 'Wallet', default: null }
}, { timestamps: true });

export const User = model<IUser>('User', UserSchema);
