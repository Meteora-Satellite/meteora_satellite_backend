import { Router } from 'express';
import PositionsController from './positions.controller';
import { authGuard } from '@common/auth-guard';
import { validate } from "@common/validate";
import {
  claimFeesBody,
  claimFeesParams,
  closePositionParams,
  createPositionBody,
  listPositionsQuery,
  rebalanceBody,
  rebalanceParams,
  removeLiquidityParams,
  removeLiquidityQuery,
  updatePositionBody,
  updatePositionParams
} from "@modules/positions/positions.schema";

const aw = (fn: any) => (req: any, res: any, next: any) =>
  Promise.resolve(fn(req, res)).catch(next);

const router = Router();

router.post('',
  authGuard(),
  validate({ body: createPositionBody }),
  aw(PositionsController.create)
);
router.get(
  '',
  authGuard(),
  validate({ query: listPositionsQuery }),
  aw(PositionsController.list)
);
router.delete(
  '/:positionId/liquidity',
  authGuard(),
  validate({ params: removeLiquidityParams, query: removeLiquidityQuery }),
  aw(PositionsController.removeLiquidity)
);
router.delete(
  '/:positionId',
  authGuard(),
  validate({ params: closePositionParams }),
  aw(PositionsController.closePosition)
);
router.post('/:positionId/claim_fees',
  authGuard(),
  validate({ params: claimFeesParams, body: claimFeesBody }),
  aw(PositionsController.claimFees)
);
router.post('/:positionId/rebalance',
  authGuard(),
  validate({ params: rebalanceParams, body: rebalanceBody }),
  aw(PositionsController.rebalance)
);
router.patch(
  '/:positionId',
  authGuard(),
  validate({ params: updatePositionParams, body: updatePositionBody }),
  aw(PositionsController.update)
);

export default router;
