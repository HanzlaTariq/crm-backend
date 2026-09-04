import express from 'express';
import Customer from '../models/Customer.js';
import User from '../models/User.js';
import AssignmentHistory from '../models/AssignmentHistory.js';
import FollowUp from '../models/FollowUp.js';
import auth from '../middleware/auth.js';
import requireRole from '../middleware/requireRole.js';
import validate from '../middleware/validate.js';
import asyncHandler from '../utils/asyncHandler.js';
import AppError from '../utils/AppError.js';
import escapeRegex from '../utils/escapeRegex.js';
import { getTeamIds } from '../utils/teamScope.js';
import { createNotification } from '../utils/notify.js';
import { logActivity } from '../utils/activityLogger.js';
import { toCsv } from '../utils/csv.js';
import {
  createCustomerSchema,
  updateCustomerSchema,
  assignCustomerSchema,
  closeCustomerSchema,
  idParamSchema,
  listCustomersQuerySchema,
  exportCustomersQuerySchema,
} from '../validators/customerValidators.js';
import { bulkAssignSchema, bulkStatusSchema } from '../validators/bulkValidators.js';

const router = express.Router();

// Non-admin/non-closer ko sirf "close done" flag dikhna chahiye —
// closedBy, closedAt, closeNote sirf admin ko milta hai.
const sanitizeClosedFields = (customer, viewerRole) => {
  const obj = customer.toObject ? customer.toObject() : customer
  if (viewerRole !== 'admin') {
    delete obj.closedBy
    delete obj.closedAt
    delete obj.closeNote
  }
  return obj
}

// getTeamIds moved to utils/teamScope.js in Phase 2 (same logic, unchanged) so
// the new dashboard analytics endpoint can share it instead of duplicating it.

// Builds the $and-able array of extra conditions from search/filter/date-range
// query params. Kept separate from role-visibility so the two never fight each other.
const buildExtraFilters = ({ search, status, assignedTo, dateFrom, dateTo }) => {
  const conditions = []

  if (search) {
    const re = new RegExp(escapeRegex(search), 'i')
    conditions.push({ $or: [{ name: re }, { phone: re }, { email: re }] })
  }
  if (status) conditions.push({ status })
  if (assignedTo) conditions.push({ assignedTo })
  if (dateFrom || dateTo) {
    const createdAt = {}
    if (dateFrom) createdAt.$gte = dateFrom
    if (dateTo) createdAt.$lte = dateTo
    conditions.push({ createdAt })
  }

  return conditions
}

router.get('/stats/summary', auth, asyncHandler(async (req, res) => {
  const { role, id } = req.user
  const teamIds = await getTeamIds(id, role)

  const matchQuery = teamIds
    ? { $or: [{ addedBy: { $in: teamIds } }, { assignedTo: { $in: teamIds } }] }
    : {}

  const [total, interested, followup, sale, lost, notInterested] = await Promise.all([
    Customer.countDocuments(matchQuery),
    Customer.countDocuments({ ...matchQuery, status: 'interested' }),
    Customer.countDocuments({ ...matchQuery, status: 'followup' }),
    Customer.countDocuments({ ...matchQuery, status: 'sale' }),
    Customer.countDocuments({ ...matchQuery, status: 'lost' }),
    Customer.countDocuments({ ...matchQuery, status: 'not-interested' }),
  ])

  res.json({ total, interested, followup, sale, lost, notInterested })
}))

// CSV export — same role-visibility + search/filter rules as GET /customers,
// just without pagination. Capped at 5000 rows so a runaway export can't blow
// up memory on a serverless function; anything bigger should filter/date-range
// down before exporting.
const EXPORT_ROW_CAP = 5000

router.get('/export', auth, validate({ query: exportCustomersQuerySchema }), asyncHandler(async (req, res) => {
  const { role, id } = req.user
  const { search, status, assignedTo, dateFrom, dateTo } = req.query

  const baseQuery = role === 'admin' ? { closed: { $ne: true } } : { assignedTo: id }
  const extra = buildExtraFilters({ search, status, assignedTo, dateFrom, dateTo })
  const finalQuery = extra.length ? { $and: [baseQuery, ...extra] } : baseQuery

  const customers = await Customer.find(finalQuery)
    .populate('addedBy', 'name')
    .populate('assignedTo', 'name')
    .populate('assignedBy', 'name')
    .sort({ createdAt: -1 })
    .limit(EXPORT_ROW_CAP)
    .lean()

  const csv = toCsv(customers, [
    { label: 'Name', value: 'name' },
    { label: 'Phone', value: 'phone' },
    { label: 'Email', value: (c) => c.email || '' },
    { label: 'Address', value: (c) => c.address || '' },
    { label: 'Status', value: 'status' },
    { label: 'Assigned To', value: (c) => c.assignedTo?.name || '' },
    { label: 'Added By', value: (c) => c.addedBy?.name || '' },
    { label: 'Notes', value: (c) => c.notes || '' },
    { label: 'Created At', value: (c) => new Date(c.createdAt).toISOString() },
  ])

  logActivity({
    actor: id,
    action: 'customer_exported',
    targetType: 'Customer',
    description: `${req.user.name} exported ${customers.length} customer(s) to CSV`,
    meta: { count: customers.length, filters: { search, status, assignedTo, dateFrom, dateTo } },
  })

  res.set({
    'Content-Type': 'text/csv',
    'Content-Disposition': `attachment; filename="customers-export-${Date.now()}.csv"`,
  })
  res.send(csv)
}))

// Get all customers — role based
// Assign hone ke baad sirf jis ko assign hua ho wahi dekhega — jisne assign kiya (assignedBy)
// ya team hierarchy me koi aur, unhe dubara list me nazar nahi aayega. Admin sab dekhta hai.
//
// PAGINATION / SEARCH / FILTER (Phase 1): opt-in via query params (?page, ?limit, ?search,
// ?status, ?assignedTo, ?dateFrom, ?dateTo). The response BODY stays a plain array — exactly
// what the current frontend expects — and pagination metadata rides along on response headers
// (X-Total-Count, X-Total-Pages, X-Page, X-Limit) so nothing breaks before the Phase 3 frontend
// update starts reading those headers and passing the new query params.
router.get('/', auth, validate({ query: listCustomersQuerySchema }), asyncHandler(async (req, res) => {
  const { role, id } = req.user
  const { page, limit, search, status, assignedTo, dateFrom, dateTo } = req.query

  const baseQuery = role === 'admin'
    ? { closed: { $ne: true } } // admin ke normal view me sirf open customers — $ne: true taake purane (bina closed field wale) docs bhi count ho
    : { assignedTo: id }

  const extra = buildExtraFilters({ search, status, assignedTo, dateFrom, dateTo })
  const finalQuery = extra.length ? { $and: [baseQuery, ...extra] } : baseQuery

  const skip = (page - 1) * limit

  const [customers, totalCount] = await Promise.all([
    Customer.find(finalQuery)
      .populate('addedBy', 'name role')
      .populate('assignedTo', 'name role')
      .populate('assignedBy', 'name role')
      .populate('closedBy', 'name role')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Customer.countDocuments(finalQuery),
  ])

  res.set({
    'X-Total-Count': String(totalCount),
    'X-Total-Pages': String(Math.max(1, Math.ceil(totalCount / limit))),
    'X-Page': String(page),
    'X-Limit': String(limit),
  })
  res.json(customers.map(c => sanitizeClosedFields(c, role)));
}));

// Admin-only — saare close ki hui customers ki poori detail (kis ne close ki, kab, note)
router.get('/closed/all', auth, requireRole('admin'), validate({ query: listCustomersQuerySchema }), asyncHandler(async (req, res) => {
  const { page, limit, search, status, assignedTo, dateFrom, dateTo } = req.query

  const baseQuery = { closed: true }
  const extra = buildExtraFilters({ search, status, assignedTo, dateFrom, dateTo })
  const finalQuery = extra.length ? { $and: [baseQuery, ...extra] } : baseQuery

  const skip = (page - 1) * limit

  const [customers, totalCount] = await Promise.all([
    Customer.find(finalQuery)
      .populate('addedBy', 'name role')
      .populate('assignedTo', 'name role')
      .populate('assignedBy', 'name role')
      .populate('closedBy', 'name role')
      .sort({ closedAt: -1 })
      .skip(skip)
      .limit(limit),
    Customer.countDocuments(finalQuery),
  ])

  res.set({
    'X-Total-Count': String(totalCount),
    'X-Total-Pages': String(Math.max(1, Math.ceil(totalCount / limit))),
    'X-Page': String(page),
    'X-Limit': String(limit),
  })
  res.json(customers)
}))

// Bulk-assign multiple customers to one user in a single request — admin/manager
// only (per product decision). Uses the exact same per-assignee role rules as the
// single-customer /:id/assign route below, just looped; one AssignmentHistory
// entry per customer (never overwritten) and one summary notification for the
// assignee instead of spamming them with one notification per customer.
// NOTE: registered before GET /:id — a two-segment literal path like /bulk/assign
// would otherwise be swallowed by a /:id/... pattern with "bulk" as the :id.
router.put('/bulk/assign', auth, requireRole('admin', 'manager'), validate({ body: bulkAssignSchema }), asyncHandler(async (req, res) => {
  const { customerIds, assignedTo, note } = req.body
  const { role, id } = req.user

  const assignee = await User.findById(assignedTo)
  if (!assignee) throw new AppError('User not found', 404)
  if (assignee.role === 'admin') throw new AppError('Cannot assign to admin', 400)

  if (role === 'manager' && !['manager', 'jmanager', 'telecom', 'salesperson'].includes(assignee.role)) {
    throw new AppError('Not authorized to assign customers', 403)
  }

  const customers = await Customer.find({ _id: { $in: customerIds }, closed: { $ne: true } })
  const foundIds = new Set(customers.map((c) => String(c._id)))
  const skipped = customerIds.filter((cid) => !foundIds.has(cid))

  await Promise.all(customers.map((customer) =>
    AssignmentHistory.create({
      customer: customer._id,
      fromUser: customer.assignedTo || null,
      toUser: assignedTo,
      assignedBy: id,
      note: note || 'Bulk assignment',
    })
  ))

  await Customer.updateMany(
    { _id: { $in: customers.map((c) => c._id) } },
    { $set: { assignedTo, assignedBy: id } }
  )

  logActivity({
    actor: id,
    action: 'bulk_assign',
    targetType: 'Customer',
    description: `${req.user.name} bulk-assigned ${customers.length} customer(s) to ${assignee.name}`,
    meta: { customerIds: customers.map((c) => String(c._id)), assignedTo, skipped },
  });

  if (customers.length && String(assignedTo) !== String(id)) {
    createNotification({
      user: assignedTo,
      type: 'bulk_assignment',
      title: 'Customers assigned to you',
      message: `${req.user.name} assigned you ${customers.length} customer(s)`,
    });
  }

  res.json({
    message: `${customers.length} customer(s) assigned`,
    assignedCount: customers.length,
    skipped, // ids that were closed or no longer exist — not modified
  })
}))

// Bulk status update — admin/manager only (per product decision). Directly sets
// status on multiple open customers; unlike POST /followups this does not create
// a FollowUp record (no note is collected per-customer in a bulk action), so use
// this for quick re-categorization, not for logging a call outcome.
router.put('/bulk/status', auth, requireRole('admin', 'manager'), validate({ body: bulkStatusSchema }), asyncHandler(async (req, res) => {
  const { customerIds, status } = req.body
  const { id } = req.user

  const result = await Customer.updateMany(
    { _id: { $in: customerIds }, closed: { $ne: true } },
    { $set: { status } }
  )

  logActivity({
    actor: id,
    action: 'bulk_status_update',
    targetType: 'Customer',
    description: `${req.user.name} bulk-updated ${result.modifiedCount} customer(s) to status "${status}"`,
    meta: { customerIds, status, matched: result.matchedCount, modified: result.modifiedCount },
  });

  res.json({
    message: `${result.modifiedCount} customer(s) updated to "${status}"`,
    matchedCount: result.matchedCount,
    modifiedCount: result.modifiedCount,
  })
}))

// Get single customer — sirf assignedTo ya admin dekh sakte hain
router.get('/:id', auth, validate({ params: idParamSchema }), asyncHandler(async (req, res) => {
  const customer = await Customer.findById(req.params.id)
    .populate('addedBy', 'name role')
    .populate('assignedTo', 'name role')
    .populate('assignedBy', 'name role')
    .populate('closedBy', 'name role');
  if (!customer) throw new AppError('Customer not found', 404);

  const { role, id } = req.user
  if (role !== 'admin' && String(customer.assignedTo?._id) !== String(id)) {
    throw new AppError('Not authorized to view this customer', 403);
  }

  res.json(sanitizeClosedFields(customer, role));
}));

// Add customer
router.post('/', auth, validate({ body: createCustomerSchema }), asyncHandler(async (req, res) => {
  if (req.user.role === 'admin') {
    throw new AppError('Admin cannot add customers', 403);
  }

  const { name, phone, email, address, notes, assignedTo } = req.body;
  const finalAssignee = assignedTo || req.user.id;
  const customer = await Customer.create({
    name, phone, email, address, notes,
    addedBy: req.user.id,
    assignedTo: finalAssignee,
    assignedBy: req.user.id,
  });

  // Timeline ki pehli entry — customer create hote hi assignment record ho
  await AssignmentHistory.create({
    customer: customer._id,
    fromUser: null,
    toUser: finalAssignee,
    assignedBy: req.user.id,
    note: 'Customer added',
  });

  logActivity({
    actor: req.user.id,
    action: 'customer_created',
    targetType: 'Customer',
    targetId: customer._id,
    description: `${req.user.name} added customer "${customer.name}"`,
  });

  // Only notify if the customer was handed straight to someone else on creation
  // — no point notifying yourself that you assigned yourself a lead.
  if (String(finalAssignee) !== String(req.user.id)) {
    createNotification({
      user: finalAssignee,
      type: 'assignment',
      title: 'New customer assigned',
      message: `${req.user.name} assigned you a new customer: ${customer.name}`,
      relatedCustomer: customer._id,
    });
  }

  res.status(201).json(customer);
}));

// Update customer — sirf assignedTo ya admin edit kar sakte hain
router.put('/:id', auth, validate({ params: idParamSchema, body: updateCustomerSchema }), asyncHandler(async (req, res) => {
  const existing = await Customer.findById(req.params.id)
  if (!existing) throw new AppError('Customer not found', 404);

  const { role, id } = req.user
  if (role !== 'admin' && String(existing.assignedTo) !== String(id)) {
    throw new AppError('Not authorized to edit this customer', 403);
  }
  if (existing.closed) {
    throw new AppError('Closed customer cannot be edited', 400);
  }

  // closed-related fields is route se change nahi honi chahiye — sirf /close endpoint se.
  // (validate() already strips unknown keys like closed/closedBy/closedAt/closeNote since
  // updateCustomerSchema doesn't define them, but we double-check here defensively.)
  const { closed, closedBy, closedAt, closeNote, ...safeBody } = req.body

  const customer = await Customer.findByIdAndUpdate(
    req.params.id, safeBody, { new: true }
  )
    .populate('addedBy', 'name role')
    .populate('assignedTo', 'name role')
    .populate('assignedBy', 'name role');

  logActivity({
    actor: id,
    action: 'customer_updated',
    targetType: 'Customer',
    targetId: customer._id,
    description: `${req.user.name} updated customer "${customer.name}"`,
    meta: { fields: Object.keys(safeBody) },
  });

  res.json(customer);
}));

// Close customer — sirf jis ko assign hua ho, ya admin
router.put('/:id/close', auth, validate({ params: idParamSchema, body: closeCustomerSchema }), asyncHandler(async (req, res) => {
  const { role, id } = req.user
  const { note } = req.body

  const customer = await Customer.findById(req.params.id)
  if (!customer) throw new AppError('Customer not found', 404);

  if (role !== 'admin' && String(customer.assignedTo) !== String(id)) {
    throw new AppError('Not authorized to close this customer', 403);
  }
  if (customer.closed) {
    throw new AppError('Customer already closed', 400);
  }

  customer.closed = true
  customer.closedBy = id
  customer.closedAt = new Date()
  customer.closeNote = note || ''
  await customer.save()

  const populated = await Customer.findById(customer._id)
    .populate('addedBy', 'name role')
    .populate('assignedTo', 'name role')
    .populate('assignedBy', 'name role')
    .populate('closedBy', 'name role')

  logActivity({
    actor: id,
    action: 'customer_closed',
    targetType: 'Customer',
    targetId: customer._id,
    description: `${req.user.name} closed customer "${customer.name}"`,
  });

  res.json(sanitizeClosedFields(populated, role));
}));

// Delete — admin only
router.delete('/:id', auth, requireRole('admin'), validate({ params: idParamSchema }), asyncHandler(async (req, res) => {
  const customer = await Customer.findById(req.params.id)
  await Customer.findByIdAndDelete(req.params.id);

  if (customer) {
    logActivity({
      actor: req.user.id,
      action: 'customer_deleted',
      targetType: 'Customer',
      targetId: req.params.id,
      description: `${req.user.name} deleted customer "${customer.name}"`,
    });
  }

  res.json({ message: 'Customer deleted' });
}));

// Assign customer to someone
router.put('/:id/assign', auth, validate({ params: idParamSchema, body: assignCustomerSchema }), asyncHandler(async (req, res) => {
  const { assignedTo, note } = req.body
  const { role, id } = req.user

  const existingCustomer = await Customer.findById(req.params.id)
  if (!existingCustomer) throw new AppError('Customer not found', 404)

  // Jis ko assign kar rahe hain uska role check karo
  const assignee = await User.findById(assignedTo)
  if (!assignee) throw new AppError('User not found', 404)

  // Admin ko assign nahi kar sakte
  if (assignee.role === 'admin') {
    throw new AppError('Cannot assign to admin', 400)
  }

  // Flat hierarchy — no team structure except admin
  // Rules:
  // - admin: can assign to anyone (except admin which is already blocked)
  // - manager: can assign to jmanager, telecom, salesperson, other managers
  // - jmanager: can assign to telecom, salesperson, other jmanagers
  // - telecom/salesperson: can assign to peers OR to manager/jmanager
  if (role === 'manager') {
    if (!['manager', 'jmanager', 'telecom', 'salesperson'].includes(assignee.role)) {
      throw new AppError('Not authorized to assign customers', 403)
    }
  } else if (role === 'jmanager') {
    if (!['jmanager', 'telecom', 'salesperson'].includes(assignee.role)) {
      throw new AppError('Not authorized to assign customers', 403)
    }
  } else if (['telecom', 'salesperson'].includes(role)) {
    if (!['telecom', 'salesperson', 'manager', 'jmanager'].includes(assignee.role)) {
      throw new AppError('Can only assign to peers or managers', 403)
    }
  } else if (role !== 'admin') {
    throw new AppError('Not authorized to assign customers', 403)
  }

  // Purani assignment ko permanently save karo — kabhi overwrite/lost nahi hogi
  await AssignmentHistory.create({
    customer: req.params.id,
    fromUser: existingCustomer.assignedTo || null,
    toUser: assignedTo,
    assignedBy: id,
    note: note || '',
  })

  const customer = await Customer.findByIdAndUpdate(
    req.params.id,
    { assignedTo, assignedBy: req.user.id },
    { new: true }
  )
    .populate('assignedTo', 'name role')
    .populate('assignedBy', 'name role')

  const isReassignment = Boolean(existingCustomer.assignedTo)

  logActivity({
    actor: id,
    action: isReassignment ? 'customer_reassigned' : 'customer_assigned',
    targetType: 'Customer',
    targetId: customer._id,
    description: `${req.user.name} ${isReassignment ? 'reassigned' : 'assigned'} "${customer.name}" to ${assignee.name}`,
  });

  if (String(assignedTo) !== String(id)) {
    createNotification({
      user: assignedTo,
      type: isReassignment ? 'reassignment' : 'assignment',
      title: isReassignment ? 'Customer reassigned to you' : 'New customer assigned',
      message: `${req.user.name} ${isReassignment ? 'reassigned' : 'assigned'} you a customer: ${customer.name}`,
      relatedCustomer: customer._id,
    });
  }

  res.json(customer)
}))

// Full timeline — assignment history + follow-ups, ek jagah, time order me
// Isi se pata chalta hai: kis ko pehle assign tha, kab, aur us waqt kya response tha
router.get('/:id/timeline', auth, validate({ params: idParamSchema }), asyncHandler(async (req, res) => {
  const customerId = req.params.id

  const [assignments, followups] = await Promise.all([
    AssignmentHistory.find({ customer: customerId })
      .populate('fromUser', 'name role')
      .populate('toUser', 'name role')
      .populate('assignedBy', 'name role')
      .sort({ createdAt: 1 }),
    FollowUp.find({ customer: customerId })
      .populate('doneBy', 'name role')
      .sort({ createdAt: 1 }),
  ])

  const timeline = [
    ...assignments.map(a => ({
      type: 'assignment',
      _id: a._id,
      createdAt: a.createdAt,
      fromUser: a.fromUser,
      toUser: a.toUser,
      assignedBy: a.assignedBy,
      note: a.note,
    })),
    ...followups.map(f => ({
      type: 'followup',
      _id: f._id,
      createdAt: f.createdAt,
      status: f.status,
      note: f.note,
      nextCallDate: f.nextCallDate,
      doneBy: f.doneBy,
    })),
  ].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))

  res.json(timeline)
}))

export default router;
