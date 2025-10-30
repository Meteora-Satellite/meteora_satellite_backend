import { Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { env } from '@config';
import { formatSiwsMessage, verifySignature } from './siws';
import AuthService from './auth.service';
import { signAccess, signRefresh, verifyRefresh } from '@common/auth';
import { findOrCreateUserByConnectedWallet } from '@modules/auth/utils';
import {
  AuthLogoutBody,
  AuthNonceBody,
  AuthRefreshBody,
  AuthVerifyBody
} from '@modules/auth/auth.schema';
import { User } from '@modules/users/User.model';
import { WalletService } from '@modules/wallets/wallets.service';
import { WALLET_KINDS } from '@common/constants';

class AuthController {
  static async nonce(req: Request<{}, {}, AuthNonceBody>, res: Response) {
    const { address } = req.body;

    const domain = env.FRONTEND_URL;
    const now = new Date();
    const expires = new Date(now.getTime() + 10 * 60 * 1000);
    const nonce = uuid();

    const message = formatSiwsMessage({
      address,
      nonce,
      domain,
      statement: 'Sign in to Meteora Satellite.',
      issuedAt: now.toISOString(),
      expirationTime: expires.toISOString(),
    });

    await AuthService.createAuthChallenge({
      address,
      nonce,
      domain,
      message,
      issuedAt: now,
      expiresAt: expires,
    });

    res.json({ ok: true, data: { message } });
  }

  static async verify(req: Request<{}, {}, AuthVerifyBody>, res: Response) {
    const { address, signature } = req.body;

    const challenge = await AuthService.findUnusedChallengeForAddress(address);
    if (!challenge) return res.status(400).json({ ok: false, error: { message: 'Challenge not found' } });
    if (new Date() > new Date(challenge.expiresAt)) {
      return res.status(400).json({ ok: false, error: { message: 'Challenge expired' } });
    }

    const canonical = challenge.message;
    if (!canonical) return res.status(500).json({ ok: false, error: { message: 'Challenge message missing' } });

    const good = verifySignature(canonical, signature, address);
    if (!good) return res.status(401).json({ ok: false, error: { message: 'Invalid signature' } });

    await AuthService.markChallengeAsUsed(challenge._id);

    // 1 connected wallet ⇔ 1 user
    const { userId, roles, custodialAddress } = await findOrCreateUserByConnectedWallet(address);

    const access = signAccess({ uid: userId, roles, externalAddress: address, custodialAddress });
    const refresh = signRefresh({ uid: userId });

    return res.json({ ok: true, data: { access, refresh } });
  }

  static async refresh(req: Request<{}, {}, AuthRefreshBody>, res: Response) {
    const refreshToken = req.body.refresh;
    if (!refreshToken) {
      return res.status(401).json({ ok: false, error: { message: 'Missing refresh token' } });
    }

    let payload: any;
    try {
      payload = verifyRefresh(refreshToken);
    } catch {
      return res.status(401).json({ ok: false, error: { message: 'Invalid refresh token' } });
    }

    // Load latest roles + wallet addresses (so access reflects current state)
    const user = await User.findById(payload.uid).lean();
    const roles: string[] = user?.roles ?? ['user'];

    let externalAddress: string | undefined;
    let custodialAddress: string | undefined;
    const wallets = await WalletService.findUserWallets(payload.uid);
    for (const w of wallets) {
      if (w.kind === WALLET_KINDS.external) externalAddress = w.address;
      if (w.kind === WALLET_KINDS.custodial) custodialAddress = w.address;
    }

    const access = signAccess({ uid: payload.uid, roles, externalAddress, custodialAddress });

    return res.json({ ok: true, data: { access } });
  }

  static async logout(req: Request<{}, {}, AuthLogoutBody>, res: Response) {
    return res.json({ ok: true });
  }
}

export default AuthController;
