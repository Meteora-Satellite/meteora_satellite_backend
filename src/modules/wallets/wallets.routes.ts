import { Router } from 'express';
import WalletsController from './wallets.controller';
import { authGuard } from "@common/auth-guard";

// small async wrapper so unhandled rejections hit error middleware
const aw = (fn: any) => (req: any, res: any, next: any) =>
  Promise.resolve(fn(req, res)).catch(next);

const router = Router();

router.get('/balances', authGuard(), aw(WalletsController.getWalletBalances));
router.get('/private-key', authGuard(), aw(WalletsController.getWalletPrivateKey));

export default router;
