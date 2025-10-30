import { Types } from "mongoose";
import {
  NotificationKind,
  NotificationType
} from "@common/types";

export type CreateNotificationInput = {
  userId: string | Types.ObjectId;
  title: string;
  body: string;
  type: NotificationType;
  kind?: NotificationKind;
  data: any
}
