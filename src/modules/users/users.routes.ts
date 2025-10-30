import { Router } from 'express';
import UserController from './users.controller';
import { authGuard } from "@common/auth-guard";

// small async wrapper so unhandled rejections hit error middleware
const aw = (fn: any) => (req: any, res: any, next: any) =>
  Promise.resolve(fn(req, res)).catch(next);

const router = Router();

router.get('/wallet', authGuard(), aw(UserController.custodialAddress));

export default router;
