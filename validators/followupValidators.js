import { z } from 'zod';
import { objectId } from './common.js';

const FOLLOWUP_STATUSES = ['interested', 'not-interested', 'followup', 'sale', 'lost'];

export const createFollowupSchema = z.object({
  customerId: objectId,
  note: z.string().trim().min(1, 'Note is required').max(5000),
  status: z.enum(FOLLOWUP_STATUSES),
  // Frontend sends '' when no date is picked (or when status isn't
  // "followup"). Treat blank/null as "not provided" *before* z.coerce.date()
  // runs, otherwise new Date('') -> Invalid Date and Zod throws a confusing
  // "Invalid date" error even though the field is meant to be optional.
  nextCallDate: z.preprocess(
    (val) => (val === '' || val === null ? undefined : val),
    z.coerce.date().optional()
  ),
});

export const customerIdParamSchema = z.object({
  customerId: objectId,
});

// Phase 4 — calendar view. Both optional; the route defaults to a sensible
// window (current month) when neither is given.
export const calendarQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});