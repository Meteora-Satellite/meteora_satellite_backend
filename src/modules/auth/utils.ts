import { startSession, Types } from 'mongoose';
import { UserService } from '@modules/users/user.service';
import { WalletService } from '@modules/wallets/wallets.service';
import { User } from '@modules/users/User.model';
import { SignInResultType } from "./types";

// TODO refactoring
/** Strict rule: 1 connected wallet ⇔ 1 user */
export async function findOrCreateUserByConnectedWallet(address: string): Promise<SignInResultType> {
  // Fast path: wallet exists → return its user (+ ensure custodial)
  const existingExternal = await WalletService.findExternalByAddress(address);
  if (existingExternal) {
    const user = await User.findById(existingExternal.userId).lean();
    if (!user) return createAllAtomically(address); // rare repair

    let custodial = await WalletService.findCustodialByUser(existingExternal.userId);

    await WalletService.touchExternalLogin(existingExternal._id as any);

    return {
      userId: user._id.toString(),
      roles: user.roles ?? ['user'],
      connectedAddress: existingExternal.address,
      custodialAddress: custodial!.address,
      created: false
    };
  }

  // Slow path: create everything atomically
  return createAllAtomically(address);
}

async function createAllAtomically(address: string): Promise<SignInResultType> {
  const s = await startSession();
  try {
    let userId!: Types.ObjectId;
    let connectedId!: Types.ObjectId;
    let connectedAddr!: string;
    let custodialId!: Types.ObjectId;
    let custodialAddr!: string;
    let roles!: string[];

    await s.withTransaction(async () => {
      const u = await UserService.createUser(['user'], s);
      userId = new Types.ObjectId(u.userId);
      roles = u.roles;

      const ext = await WalletService.createExternal(userId, address, s);
      connectedId = new Types.ObjectId(ext.walletId);
      connectedAddr = ext.address;

      const c = await WalletService.createCustodial(userId, s);
      custodialId = new Types.ObjectId(c.walletId);
      custodialAddr = c.address;

      await UserService.setConnectedAndPrimary(userId, connectedId, custodialId, s);
    });

    return {
      userId: userId.toString(),
      roles,
      connectedAddress: connectedAddr,
      custodialAddress: custodialAddr,
      created: true
    };
  } finally {
    await s.endSession();
  }
}

export function trimNumStr(s: string) {
  // remove trailing zeros and trailing dot for nicer display
  if (!s.includes('.')) return s;
  return s.replace(/\.?0+$/, '');
}
