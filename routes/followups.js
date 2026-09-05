import express from 'express';
import FollowUp from '../models/FollowUp.js';
import Customer from '../models/Customer.js';
import auth from '../middleware/auth.js';
import validate from '../middleware/validate.js';
import asyncHandler from '../utils/asyncHandler.js';
import AppError from '../utils/AppError.js';
import { getTeamIds } from '../utils/teamScope.js';
import { createFollowupSchema, customerIdParamSchema, calendarQuerySchema } from '../validators/followupValidators.js';
import { logActivity } from '../utils/activityLogger.js';

const router = express.Router();

// Phase 4 — Calendar view of upcoming follow-up calls (nextCallDate).
// IMPORTANT: registered before '/:customerId' so Express doesn't swallow
// "/calendar/upcoming" as a customerId param.
//
// Reuses the same "only the most recent follow-up per customer represents the
// current next call" rule the reminders cron already relies on (routes/cron.js)
// — an earlier follow-up's nextCallDate may be stale once a later one supersedes it.
router.get('/calendar/upcoming', auth, validate({ query: calendarQuerySchema }), asyncHandler(async (req, res) => {
  const { role, id } = req.user;
  const now = new Date();

  // Default window: current month, when the frontend doesn't pass one.
  const from = req.query.from || new Date(now.getFullYear(), now.getMonth(), 1);
  const to = req.query.to || new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  const teamIds = await getTeamIds(id, role);

  // Calendar is "who's responsible for making this call", so scope by
  // assignedTo (not addedBy) — same hierarchy rule, different field.
  const scopedCustomerIds = teamIds
    ? (await Customer.find({ assignedTo: { $in: teamIds } }).select('_id')).map((c) => c._id)
    : null;

  const latestPerCustomer = await FollowUp.aggregate([
    { $sort: { customer: 1, createdAt: -1 } },
    { $group: { _id: '$customer', latest: { $first: '$$ROOT' } } },
    { $replaceRoot: { newRoot: '$latest' } },
    {
      $match: {
        nextCallDate: { $ne: null, $gte: from, $lte: to },
        ...(scopedCustomerIds ? { customer: { $in: scopedCustomerIds } } : {}),
      },
    },
    { $sort: { nextCallDate: 1 } },
  ]);

  const populated = await FollowUp.populate(latestPerCustomer, [
    { path: 'customer', select: 'name phone status assignedTo closed' },
    { path: 'doneBy', select: 'name role' },
  ]);

  // Drop entries whose customer no longer exists (deleted) — nothing to show for those.
  res.json(populated.filter((f) => f.customer));
}));

// Get followups of a customer
router.get('/:customerId', auth, validate({ params: customerIdParamSchema }), asyncHandler(async (req, res) => {
  const followups = await FollowUp.find({ customer: req.params.customerId })
    .populate('doneBy', 'name role')
    .sort({ createdAt: -1 });

  res.json(followups);
}));

// Add followup
router.post('/', auth, validate({ body: createFollowupSchema }), asyncHandler(async (req, res) => {
  const { customerId, note, status, nextCallDate } = req.body;

  const customer = await Customer.findById(customerId);
  if (!customer) throw new AppError('Customer not found', 404);

  // Followup create karo
  const followup = await FollowUp.create({
    customer: customerId,
    doneBy: req.user.id,
    note,
    status,
    nextCallDate,
  });

  // Customer ka status bhi update karo
  await Customer.findByIdAndUpdate(customerId, { status });

  logActivity({
    actor: req.user.id,
    action: 'followup_created',
    targetType: 'Customer',
    targetId: customerId,
    description: `${req.user.name} logged a follow-up for "${customer.name}" (${status})`,
  });

  res.status(201).json(followup);
}));

export default router;