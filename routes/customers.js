import express from 'express';
import Customer from '../models/Customer.js';
import User from '../models/User.js';
import auth from '../middleware/auth.js';

const router = express.Router();

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

router.get('/stats/summary', auth, async (req, res) => {
  try {
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
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
})

// Get all customers — role based
router.get('/', auth, async (req, res) => {
  try {
    const { role, id } = req.user
    const teamIds = await getTeamIds(id, role)

    let query;
    if (!teamIds) {
      // Admin — sab dekhe
      query = {}
    } else {
      // addedBy YA assignedTo dono check karo
      query = {
        $or: [
          { addedBy: { $in: teamIds } },
          { assignedTo: { $in: teamIds } }
        ]
      }
    }

    const customers = await Customer.find(query)
      .populate('addedBy', 'name role')
      .populate('assignedTo', 'name role')
      .sort({ createdAt: -1 });

    res.json(customers);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get single customer
router.get('/:id', auth, async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id)
      .populate('addedBy', 'name role')
      .populate('assignedTo', 'name role');
    if (!customer) return res.status(404).json({ message: 'Customer not found' });
    res.json(customer);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Add customer
router.post('/', auth, async (req, res) => {
  try {
    const { name, phone, email, address, notes, assignedTo } = req.body;
    const customer = await Customer.create({
      name, phone, email, address, notes,
      addedBy: req.user.id,
      assignedTo: assignedTo || req.user.id,
    });
    res.status(201).json(customer);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Update customer
router.put('/:id', auth, async (req, res) => {
  try {
    const customer = await Customer.findByIdAndUpdate(
      req.params.id, req.body, { new: true }
    );
    if (!customer) return res.status(404).json({ message: 'Customer not found' });
    res.json(customer);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Delete — admin only
router.delete('/:id', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized' });
    }
    await Customer.findByIdAndDelete(req.params.id);
    res.json({ message: 'Customer deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});



// Assign customer to someone
router.put('/:id/assign', auth, async (req, res) => {
  try {
    const { assignedTo } = req.body
    const { role, id } = req.user

    // Telecom aur salesperson assign nahi kar sakte
    if (['telecom', 'salesperson'].includes(role)) {
      return res.status(403).json({ message: 'Not authorized to assign customers' })
    }

    // Jis ko assign kar rahe hain uska role check karo
    const assignee = await User.findById(assignedTo)
    if (!assignee) return res.status(404).json({ message: 'User not found' })

    // Admin ko assign nahi kar sakte
    if (assignee.role === 'admin') {
      return res.status(400).json({ message: 'Cannot assign to admin' })
    }

    // Manager — sirf apni hierarchy mein assign kare
    if (role === 'manager') {
      const teamIds = await getTeamIds(id, role)
      if (!teamIds.map(String).includes(String(assignedTo))) {
        return res.status(403).json({ message: 'Can only assign to your team members' })
      }
    }

    // J.Manager — sirf apne neeche wale ko
    if (role === 'jmanager') {
      const teamIds = await getTeamIds(id, role)
      if (!teamIds.map(String).includes(String(assignedTo))) {
        return res.status(403).json({ message: 'Can only assign to your team members' })
      }
    }

    const customer = await Customer.findByIdAndUpdate(
      req.params.id,
      { assignedTo },
      { new: true }
    ).populate('assignedTo', 'name role')

    res.json(customer)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

export default router;