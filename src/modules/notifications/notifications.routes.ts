import { Router } from 'express';
import { authGuard } from '@common/auth-guard';
import { validate } from "@common/validate";
import NotificationController from "./notifications.controller";
import {
  notificationReadParams,
  notificationsListQuerySchema
} from "@modules/notifications/notifications.schema";

const aw = (fn: any) => (req: any, res: any, next: any) =>
  Promise.resolve(fn(req, res)).catch(next);

const router = Router();

router.get(
  "",
  authGuard(),
  validate({ query: notificationsListQuerySchema }),
  aw(NotificationController.list)
)
router.post(
  "/:notificationId/read",
  authGuard(),
  validate({ params: notificationReadParams }),
  aw(NotificationController.markRead)
)
router.post(
  "/read-all",
  authGuard(),
  aw(NotificationController.markAllRead)
)

export default router;
