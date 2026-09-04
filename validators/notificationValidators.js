import { z } from 'zod';
import { objectId } from './common.js';

export const listNotificationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  unreadOnly: z.coerce.boolean().optional(),
});

export const notificationIdParamSchema = z.object({
  id: objectId,
});
