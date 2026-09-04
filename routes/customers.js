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
import {
  createCustomerSchema,
  updateCustomerSchema,
  assignCustomerSchema,
  closeCustomerSchema,
  idParamSchema,
  listCustomersQuerySchema,
} from '../validators/customerValidators.js';

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

// Helper — get all user IDs under a manager/jmanager
const getTeamIds = async (userId, role) => {
  if (role === 'admin') return null; // null = sab

  if (role === 'manager') {
    const jmanagers = await User.find({ manager: userId }).select('_id')
    const jmanagerIds = jmanagers.map(j => j._id)
    const bottom = await User.find({ manager: { $in: jmanagerIds } }).select('_id')
    const bottomIds = bottom.map(b => b._id)
    return [userId, ...jmanagerIds, ...bottomIds]
  }

  if (role === 'jmanager') {
    const bottom = await User.find({ manager: userId }).select('_id')
    const bottomIds = bottom.map(b => b._id)
    return [userId, ...bottomIds]
  }

  // telecom / salesperson — sirf apna
  return [userId]
}

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

  res.json(sanitizeClosedFields(populated, role));
}));

// Delete — admin only
router.delete('/:id', auth, requireRole('admin'), validate({ params: idParamSchema }), asyncHandler(async (req, res) => {
  await Customer.findByIdAndDelete(req.params.id);
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
