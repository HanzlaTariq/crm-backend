import { z } from 'zod';
import { objectId } from './common.js';

const ROLES = ['admin', 'manager', 'jmanager', 'telecom', 'salesperson'];

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string().trim().toLowerCase().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters').max(128),
  role: z.enum(ROLES).default('salesperson'),
  managerId: objectId.optional().nullable(),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const updateUserSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  email: z.string().trim().toLowerCase().email('Invalid email address').optional(),
  role: z.enum(ROLES).optional(),
  managerId: objectId.optional().nullable(),
});

export const idParamSchema = z.object({
  id: objectId,
});
