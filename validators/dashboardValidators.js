import { z } from 'zod';

export const analyticsQuerySchema = z.object({
  period: z.enum(['week', 'month', 'year']).default('month'),
});
