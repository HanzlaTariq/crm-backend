import { z } from 'zod';
import { objectId } from './common.js';

const STATUSES = ['new', 'interested', 'not-interested', 'followup', 'sale', 'lost'];

export const bulkAssignSchema = z.object({
  customerIds: z
    .array(objectId)
    .min(1, 'At least one customer is required')
    .max(200, 'Cannot bulk-assign more than 200 customers at once'),
  assignedTo: objectId,
  note: z.string().trim().max(1000).optional().or(z.literal('')),
});

export const bulkStatusSchema = z.object({
  customerIds: z
    .array(objectId)
    .min(1, 'At least one customer is required')
    .max(200, 'Cannot bulk-update more than 200 customers at once'),
  status: z.enum(STATUSES),
});
