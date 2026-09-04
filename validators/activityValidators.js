import { z } from 'zod';
import { objectId } from './common.js';

export const ACTIVITY_ACTIONS = [
  'login',
  'customer_created',
  'customer_updated',
  'customer_closed',
  'customer_deleted',
  'customer_exported',
  'customer_assigned',
  'customer_reassigned',
  'bulk_assign',
  'bulk_status_update',
  'followup_created',
  'user_created',
  'user_updated',
  'attachment_uploaded',
  'attachment_deleted',
];

export const listActivityQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  action: z.enum(ACTIVITY_ACTIONS).optional(),
  actorId: objectId.optional(), // admin-only filter; ignored for non-admins
});
