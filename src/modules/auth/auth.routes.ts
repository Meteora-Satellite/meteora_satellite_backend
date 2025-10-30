import { Router } from 'express';
import AuthController from './auth.controller';
import { validate } from "@common/validate";
import {
  authLogoutBody,
  authNonceBody,
  authRefreshBody,
  authVerifyBody
} from "@modules/auth/auth.schema";

const aw = (fn: any) => (req: any, res: any, next: any) =>
  Promise.resolve(fn(req, res)).catch(next);

const router = Router();

router.post('/nonce',
  validate({ body: authNonceBody }),
  aw(AuthController.nonce)
);
router.post('/verify',
  validate({ body: authVerifyBody }),
  aw(AuthController.verify)
);
router.post('/refresh',
  validate({ body: authRefreshBody }),
  aw(AuthController.refresh)
);
router.post('/logout',
  validate({ body: authLogoutBody }),
  aw(AuthController.logout)
);

export default router;
