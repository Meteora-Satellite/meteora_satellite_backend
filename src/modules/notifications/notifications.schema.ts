import { z } from "zod";
import {
  NotificationType
} from "@common/types";
import { NOTIFICATION_TYPES } from "@common/constants";
import { registry } from "@common/openapi";

export const notificationsListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  unreadOnly: z.coerce.boolean().optional(),
  type: z.nativeEnum(NotificationType).optional(),
}).strict().openapi("ListQuerySchema");

export type NotificationsListQuery = z.infer<typeof notificationsListQuerySchema>;

export const notificationReadParams = z.object({
  notificationId: z.string().min(1).openapi({ example: '68f8fdf716e42434b4cf7427' }),
}).openapi('NotificationReadParams');

export type NotificationReadParams = z.infer<typeof notificationReadParams>;


export const notificationDTO = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  type: z.nativeEnum(NOTIFICATION_TYPES),
  data: z.record(z.any()),
  isRead: z.boolean(),
  createdAt: z.string().datetime(),
}).openapi('NotificationDTO');

const serverError = z.object({
  ok: z.literal(false),
  data: z.object({ message: z.string() }),
});

registry.registerPath({
  method: 'get',
  path: '/notifications',
  description: 'List notifications for the authenticated user with pagination and optional filters.',
  summary: 'List my notifications',
  tags: ['Notifications'],
  security: [{ bearerAuth: [] }],
  request: {
    query: notificationsListQuerySchema,
  },
  responses: {
    200: {
      description: 'List of notifications',
      content: {
        'application/json': {
          schema: z.object({
            ok: z.literal(true),
            data: z.object({
              items: z.array(notificationDTO),
              page: z.number(),
              limit: z.number(),
              total: z.number(),
              pages: z.number(),
            }),
          }),
        },
      },
    },
    401: { description: 'Unauthorized' },
    500: {
      description: 'Server error',
      content: { 'application/json': { schema: serverError } },
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/notifications/{notificationId}/read',
  description: 'Mark a single notification as read for the authenticated user.',
  summary: 'Mark notification as read',
  tags: ['Notifications'],
  security: [{ bearerAuth: [] }],
  request: {
    params: notificationReadParams,
  },
  responses: {
    200: {
      description: 'Marked as read',
      content: {
        'application/json': {
          schema: z.object({
            ok: z.literal(true),
            data: z.object({ read: z.literal(true) }),
          }),
        },
      },
    },
    404: {
      description: 'Not found',
      content: {
        'application/json': {
          schema: z.object({
            ok: z.literal(false),
            error: z.string(),
          }),
        },
      },
    },
    401: { description: 'Unauthorized' },
    500: {
      description: 'Server error',
      content: { 'application/json': { schema: serverError } },
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/notifications/read-all',
  description: 'Mark all unread notifications as read for the authenticated user.',
  summary: 'Mark all notifications as read',
  tags: ['Notifications'],
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: 'Count of updated notifications',
      content: {
        'application/json': {
          schema: z.object({
            ok: z.literal(true),
            data: z.object({ updated: z.number() }),
          }),
        },
      },
    },
    401: { description: 'Unauthorized' },
    500: {
      description: 'Server error',
      content: { 'application/json': { schema: serverError } },
    },
  },
});
