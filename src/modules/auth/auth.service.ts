import {
  AuthChallenge,
  IAuthChallenge
} from './Auth.model';
import { CreateAuthChallengeType } from "./types";

class AuthService {
  static async createAuthChallenge(input: CreateAuthChallengeType) {
    // Invalidate old unused/unexpired challenges for the address
    await AuthChallenge.updateMany(
      { address: input.address, usedAt: null },
      { $set: { expiresAt: new Date() } }
    );

    return AuthChallenge.create(input);
  }

  static async findUnusedChallengeForAddress(address: string): Promise<IAuthChallenge | null> {
    return AuthChallenge
      .findOne({ address, usedAt: null })
      .sort({ issuedAt: -1 })
      .lean();
  }

  static async markChallengeAsUsed(id: string) {
    await AuthChallenge.updateOne(
      { _id: id },
      { $set: { usedAt: new Date() } }
    );
  }
}

export default AuthService;
