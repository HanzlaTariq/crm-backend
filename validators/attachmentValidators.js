import { z } from 'zod';
import { objectId } from './common.js';

export const customerIdParamSchema = z.object({
  customerId: objectId,
});

export const attachmentIdParamSchema = z.object({
  id: objectId,
});
