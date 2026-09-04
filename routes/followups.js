import express from 'express';
import FollowUp from '../models/FollowUp.js';
import Customer from '../models/Customer.js';
import auth from '../middleware/auth.js';
import validate from '../middleware/validate.js';
import asyncHandler from '../utils/asyncHandler.js';
import AppError from '../utils/AppError.js';
import { createFollowupSchema, customerIdParamSchema } from '../validators/followupValidators.js';

const router = express.Router();

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

  res.status(201).json(followup);
}));

export default router;
