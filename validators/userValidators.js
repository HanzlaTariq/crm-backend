import { z } from 'zod';

const ROLES = ['admin', 'manager', 'jmanager', 'telecom', 'salesperson'];

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(150).optional(),
  role: z.enum(ROLES).optional(),
  isActive: z.coerce.boolean().optional(),
});
