import { Types } from 'mongoose';
import {
  IWallet,
  Wallet
} from './Wallet.model';
import { encryptAesGcm } from '@common/secret-box';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { WALLET_KINDS } from "@common/constants";

export type WalletDTO = { walletId: string; address: string };

export const WalletService = {
  async findExternalByAddress(address: string) {
    return Wallet.findOne({ address, kind: WALLET_KINDS.external }).lean();
  },

  async createExternal(userId: Types.ObjectId, address: string, session?: any): Promise<WalletDTO> {
    const w = await Wallet.create([{
      userId, address, kind: WALLET_KINDS.external,
      secret: null, firstSeenAt: new Date(), lastConnectedAt: new Date(), loginCount: 1
    }], { session }).then(r => r[0]);
    return { walletId: w._id.toString(), address: w.address };
  },

  async touchExternalLogin(walletId: Types.ObjectId) {
    await Wallet.updateOne({ _id: walletId }, {
      $set: { lastConnectedAt: new Date() }, $inc: { loginCount: 1 }
    });
  },

  async createCustodial(userId: Types.ObjectId, session?: any): Promise<WalletDTO> {
    const kp = Keypair.generate();
    const addr = bs58.encode(kp.publicKey.toBytes());
    const secret = encryptAesGcm(Buffer.from(kp.secretKey));
    const w = await Wallet.create([{
      userId, address: addr, kind: WALLET_KINDS.custodial, secret
    }], { session }).then(r => r[0]);
    return { walletId: w._id.toString(), address: w.address };
  },

  async findCustodialByUser(userId: string | Types.ObjectId): Promise<IWallet | null> {
    return Wallet.findOne({userId, kind: WALLET_KINDS.custodial}).lean();
  },

  async findUserWallets(userId: string | Types.ObjectId): Promise<IWallet[] | []> {
    return Wallet.find({ userId }).lean();
  }
};
