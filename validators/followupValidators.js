import { z } from 'zod';
import { objectId } from './common.js';

const FOLLOWUP_STATUSES = ['interested', 'not-interested', 'followup', 'sale', 'lost'];

export const createFollowupSchema = z.object({
  customerId: objectId,
  note: z.string().trim().min(1, 'Note is required').max(5000),
  status: z.enum(FOLLOWUP_STATUSES),
  nextCallDate: z.coerce.date().optional(),
});

export const customerIdParamSchema = z.object({
  customerId: objectId,
});
