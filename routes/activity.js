import express from 'express';
import Activity from '../models/Activity.js';
import auth from '../middleware/auth.js';
import validate from '../middleware/validate.js';
import asyncHandler from '../utils/asyncHandler.js';
import { listActivityQuerySchema } from '../validators/activityValidators.js';

const router = express.Router();

// Visibility rule: admin sees the company-wide feed (optionally filtered to one
// actor). Everyone else sees only their own actions — same "your own data only"
// boundary the rest of the API already enforces for non-admin roles.
router.get('/', auth, validate({ query: listActivityQuerySchema }), asyncHandler(async (req, res) => {
  const { role, id } = req.user;
  const { page, limit, action, actorId } = req.query;

  const query = {};
  if (role === 'admin') {
    if (actorId) query.actor = actorId;
  } else {
    query.actor = id; // non-admins can't view others' activity
  }
  if (action) query.action = action;

  const skip = (page - 1) * limit;

  const [activities, totalCount] = await Promise.all([
    Activity.find(query)
      .populate('actor', 'name role')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Activity.countDocuments(query),
  ]);

  res.set({
    'X-Total-Count': String(totalCount),
    'X-Total-Pages': String(Math.max(1, Math.ceil(totalCount / limit))),
    'X-Page': String(page),
    'X-Limit': String(limit),
  });
  res.json(activities);
}));

export default router;
