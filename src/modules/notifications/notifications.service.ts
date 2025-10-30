import {
  FilterQuery,
  Types
} from "mongoose";
import {
  INotification,
  Notification
} from "./Notification.model";
import {
  NotificationsListQuery
} from "./notifications.schema";
import {
  NotificationKind,
} from "@common/types";
import { CreateNotificationInput } from "@modules/notifications/type";

export default class NotificationService {
  static async create(input: CreateNotificationInput): Promise<INotification> {
    return await Notification.create({
      userId: input.userId,
      title: input.title,
      body: input.body,
      type: input.type,
      kind: input.kind ?? NotificationKind.GENERIC,
      data: input.data,
    });
  }

  static async listByUser(userId: string, query: NotificationsListQuery) {
    const { page, limit, unreadOnly, type } = query;
    const filter: FilterQuery<typeof Notification> = { userId: new Types.ObjectId(userId) };
    if (unreadOnly) filter.isRead = false;
    if (type) filter.type = type;

    const [docs, total] = await Promise.all([
      Notification.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      Notification.countDocuments(filter),
    ]);

    const items = docs.map(d => d.toDTO());

    return { items, total };
  }

  static async markRead(userId: string, notificationId: string): Promise<boolean> {
    const notification: INotification | null = await Notification.findOne(
      { _id: notificationId, userId }
    );
    if (!notification) return false;
    if (notification.isRead) return true;

    // TODO update it to don't send second same request
    const res = await Notification.updateOne(
      { _id: notificationId, userId, isRead: false },
      { $set: { isRead: true, readAt: new Date() } }
    );
    return res.modifiedCount > 0;
  }

  static async markAllRead(userId: string): Promise<number> {
    const res = await Notification.updateMany(
      { userId: new Types.ObjectId(userId), isRead: false },
      { $set: { isRead: true, readAt: new Date() } }
    );
    return res.modifiedCount;
  }
}
