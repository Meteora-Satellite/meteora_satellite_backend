import { Types } from 'mongoose';
import { User } from './User.model';

export type UserDTO = { userId: string; roles: string[] };

export const UserService = {
  async createUser(roles: string[] = ['user'], session?: any): Promise<UserDTO> {
    const user = await User.create([{ roles }], { session }).then(r => r[0]);
    return { userId: user._id.toString(), roles: user.roles };
  },

  async setConnectedAndPrimary(userId: Types.ObjectId, connectedWalletId: Types.ObjectId, custodialWalletId: Types.ObjectId, session?: any) {
    await User.updateOne(
      { _id: userId },
      { $set: { connectedWallet: connectedWalletId, primaryWallet: custodialWalletId } },
      { session }
    );
  },

  async getById(id: Types.ObjectId) {
    return User.findById(id);
  },

  async setPrimaryWallet(userId: Types.ObjectId, walletId: Types.ObjectId, session?: any) {
    await User.updateOne({ _id: userId }, { $set: { primaryWallet: walletId } }, { session });
  }
};
