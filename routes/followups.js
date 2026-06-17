import express from 'express';
import FollowUp from '../models/FollowUp.js';
import Customer from '../models/Customer.js';
import auth from '../middleware/auth.js';

const router = express.Router();

// Get followups of a customer
router.get('/:customerId', auth, async (req, res) => {
  try {
    const followups = await FollowUp.find({ customer: req.params.customerId })
      .populate('doneBy', 'name role')
      .sort({ createdAt: -1 });

    res.json(followups);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Add followup
router.post('/', auth, async (req, res) => {
  try {
    const { customerId, note, status, nextCallDate } = req.body;

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
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;