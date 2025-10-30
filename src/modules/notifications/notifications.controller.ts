import { Request, Response } from "express";
import NotificationService from "./notifications.service";
import {
  NotificationReadParams,
  NotificationsListQuery,
} from "./notifications.schema";

export default class NotificationController {
  static async list(req: Request<{}, {}, {}, NotificationsListQuery>, res: Response) {
    try {
      const { page, limit } = req.query;

      const { items, total } = await NotificationService.listByUser(req.user.uid, req.query);

      return res.json({
        ok: true,
        data: { items, page, limit, total }
      });
    } catch (err: any) {
      console.log('Error getting list notifications', err);
      return res.status(500).send({ ok: false, data: { message: err.message } });
    }
  }

  static async markRead(req: Request<NotificationReadParams, {}, {}>, res: Response) {
    try {
      const updated = await NotificationService.markRead(req.user.uid, req.params.notificationId);
      if (!updated) return res.status(404).json({ ok: false, error: "Not found notification by id" });
      return res.json({ ok: true, data: { read: true } });
    } catch (err: any) {
      console.log('Error mark notification as read', req.params.notificationId, err);
      return res.status(500).send({ ok: false, data: { message: err.message } });
    }
  }

  static async markAllRead(req: Request<{}, {}, {}>, res: Response) {
    try {
      const count = await NotificationService.markAllRead(req.user.uid);
      return res.json({ ok: true, data: { updated: count } });
    } catch (err: any) {
      console.log('Error mark all notifications as read', err);
      return res.status(500).send({ ok: false, data: { message: err.message } });
    }
  }
}
