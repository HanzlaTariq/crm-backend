import express from 'express';
import User from '../models/User.js';
import auth from '../middleware/auth.js';
import validate from '../middleware/validate.js';
import asyncHandler from '../utils/asyncHandler.js';
import escapeRegex from '../utils/escapeRegex.js';
import { listUsersQuerySchema } from '../validators/userValidators.js';

const router = express.Router();

// Get team — role based
// PAGINATION / SEARCH / FILTER (Phase 1): same pattern as GET /customers — opt-in via
// query params, body stays a plain array for backward compatibility, pagination metadata
// rides on response headers (X-Total-Count, X-Total-Pages, X-Page, X-Limit).
router.get('/', auth, validate({ query: listUsersQuerySchema }), asyncHandler(async (req, res) => {
  const { role } = req.user
  const { page, limit, search, role: roleFilter, isActive } = req.query

  const baseQuery = role === 'admin'
    ? {} // Admin — sab dekhe
    : { role: { $ne: 'admin' } } // All non-admin roles see all users except admin

  const extra = []
  if (search) {
    const re = new RegExp(escapeRegex(search), 'i')
    extra.push({ $or: [{ name: re }, { email: re }] })
  }
  if (roleFilter) extra.push({ role: roleFilter })
  if (isActive !== undefined) extra.push({ isActive })

  const finalQuery = extra.length ? { $and: [baseQuery, ...extra] } : baseQuery
  const skip = (page - 1) * limit

  const [users, totalCount] = await Promise.all([
    User.find(finalQuery)
      .select('-password')
      .populate('manager', 'name role')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    User.countDocuments(finalQuery),
  ])

  res.set({
    'X-Total-Count': String(totalCount),
    'X-Total-Pages': String(Math.max(1, Math.ceil(totalCount / limit))),
    'X-Page': String(page),
    'X-Limit': String(limit),
  })
  res.json(users);
}));

// Get all managers/jmanagers for dropdown
router.get('/assignable', auth, asyncHandler(async (req, res) => {
  const { role, id } = req.user

  let users = [];

  if (role === 'admin') {
    users = await User.find({
      role: { $in: ['manager', 'jmanager'] }
    }).select('-password');
  } else if (role === 'manager') {
    users = await User.find({
      manager: id,
      role: 'jmanager'
    }).select('-password');
  }

  res.json(users);
}));

export default router;
