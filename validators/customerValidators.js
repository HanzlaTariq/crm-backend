import { z } from 'zod';
import { objectId } from './common.js';

const STATUSES = ['new', 'interested', 'not-interested', 'followup', 'sale', 'lost'];

export const createCustomerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(150),
  phone: z.string().trim().min(6, 'Phone must be at least 6 characters').max(30),
  email: z.string().trim().toLowerCase().email('Invalid email address').optional().or(z.literal('')),
  address: z.string().trim().max(500).optional().or(z.literal('')),
  notes: z.string().trim().max(5000).optional().or(z.literal('')),
  assignedTo: objectId.optional(),
});

export const updateCustomerSchema = z.object({
  name: z.string().trim().min(2).max(150).optional(),
  phone: z.string().trim().min(6).max(30).optional(),
  email: z.string().trim().toLowerCase().email('Invalid email address').optional().or(z.literal('')),
  address: z.string().trim().max(500).optional().or(z.literal('')),
  notes: z.string().trim().max(5000).optional().or(z.literal('')),
  status: z.enum(STATUSES).optional(),
});

export const assignCustomerSchema = z.object({
  assignedTo: objectId,
  note: z.string().trim().max(1000).optional().or(z.literal('')),
});

export const closeCustomerSchema = z.object({
  note: z.string().trim().max(1000).optional().or(z.literal('')),
});

export const idParamSchema = z.object({
  id: objectId,
});

export const listCustomersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(150).optional(),
  status: z.enum(STATUSES).optional(),
  assignedTo: objectId.optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
});

// Same filters as the list endpoint, without pagination — export always returns
// every matching row (capped, see routes/customers.js) rather than one page.
export const exportCustomersQuerySchema = z.object({
  search: z.string().trim().max(150).optional(),
  status: z.enum(STATUSES).optional(),
  assignedTo: objectId.optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
});
