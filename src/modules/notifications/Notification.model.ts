import {
  Schema,
  model,
  Types,
  HydratedDocument,
  Model
} from "mongoose";
import {
  NotificationKind,
  NotificationType,
} from "@common/types";

export type NotificationDTO = {
  id: string;
  title: string;
  body: string;
  type: NotificationType;
  isRead: boolean;
  createdAt: Date;
};

export interface INotification {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  title: string;
  body: string;
  type: NotificationType;
  kind: NotificationKind;
  data: Record<string, unknown>;
  isRead: boolean;
  readAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Mongoose methods on the document */
interface NotificationMethods {
  toDTO(this: HydratedDocument<INotification>): NotificationDTO;
}

/** Mongoose model type (no statics for now) */
export type NotificationModel = Model<INotification, {}, NotificationMethods>;


const NotificationSchema = new Schema<INotification>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    body: { type: String, trim: true, maxlength: 5000 },
    type: {
      type: String,
      enum: Object.values(NotificationType),
      index: true,
    },
    kind: {
      type: String,
      enum: Object.values(NotificationKind),
      default: NotificationKind.GENERIC,
      index: true,
    },
    data: { type: Schema.Types.Mixed, default: {} },
    isRead: { type: Boolean, default: false, index: true },
    readAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// helpful compound indexes for common queries
NotificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });
NotificationSchema.index({ userId: 1, createdAt: -1 });

NotificationSchema.method('toDTO', function toDTO(this: HydratedDocument<INotification>): NotificationDTO {
  return {
    id: this._id.toString(),
    title: this.title,
    body: this.body,
    type: this.type,
    isRead: this.isRead,
    createdAt: this.createdAt
  };
});

export const Notification = model<INotification, NotificationModel>("Notification", NotificationSchema);
