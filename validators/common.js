import { z } from 'zod';

// Reusable pieces shared across validator files.

export const objectId = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, 'Invalid id format');

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const dateRangeQuery = z.object({
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
});
