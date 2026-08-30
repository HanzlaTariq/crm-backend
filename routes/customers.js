import express from 'express';
import Customer from '../models/Customer.js';
import User from '../models/User.js';
import AssignmentHistory from '../models/AssignmentHistory.js';
import FollowUp from '../models/FollowUp.js';
import auth from '../middleware/auth.js';

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
// Assign hone ke baad sirf jis ko assign hua ho wahi dekhega — jisne assign kiya (assignedBy)
// ya team hierarchy me koi aur, unhe dubara list me nazar nahi aayega. Admin sab dekhta hai.
router.get('/', auth, async (req, res) => {
  try {
    const { role, id } = req.user

    const query = role === 'admin'
      ? { closed: { $ne: true } } // admin ke normal view me sirf open customers — $ne: true taake purane (bina closed field wale) docs bhi count ho
      : { assignedTo: id }

    const customers = await Customer.find(query)
      .populate('addedBy', 'name role')
      .populate('assignedTo', 'name role')
      .populate('assignedBy', 'name role')
      .populate('closedBy', 'name role')
      .sort({ createdAt: -1 });

    res.json(customers.map(c => sanitizeClosedFields(c, role)));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Admin-only — saare close ki hui customers ki poori detail (kis ne close ki, kab, note)
router.get('/closed/all', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized' })
    }

    const customers = await Customer.find({ closed: true })
      .populate('addedBy', 'name role')
      .populate('assignedTo', 'name role')
      .populate('assignedBy', 'name role')
      .populate('closedBy', 'name role')
      .sort({ closedAt: -1 })

    res.json(customers)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// Get single customer — sirf assignedTo ya admin dekh sakte hain
router.get('/:id', auth, async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id)
      .populate('addedBy', 'name role')
      .populate('assignedTo', 'name role')
      .populate('assignedBy', 'name role')
      .populate('closedBy', 'name role');
    if (!customer) return res.status(404).json({ message: 'Customer not found' });

    const { role, id } = req.user
    if (role !== 'admin' && String(customer.assignedTo?._id) !== String(id)) {
      return res.status(403).json({ message: 'Not authorized to view this customer' });
    }

    res.json(sanitizeClosedFields(customer, role));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Add customer
router.post('/', auth, async (req, res) => {
  try {
    if (req.user.role === 'admin') {
      return res.status(403).json({ message: 'Admin cannot add customers' });
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
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Update customer — sirf assignedTo ya admin edit kar sakte hain
router.put('/:id', auth, async (req, res) => {
  try {
    const existing = await Customer.findById(req.params.id)
    if (!existing) return res.status(404).json({ message: 'Customer not found' });

    const { role, id } = req.user
    if (role !== 'admin' && String(existing.assignedTo) !== String(id)) {
      return res.status(403).json({ message: 'Not authorized to edit this customer' });
    }
    if (existing.closed) {
      return res.status(400).json({ message: 'Closed customer cannot be edited' });
    }

    // closed-related fields is route se change nahi honi chahiye — sirf /close endpoint se
    const { closed, closedBy, closedAt, closeNote, ...safeBody } = req.body

    const customer = await Customer.findByIdAndUpdate(
      req.params.id, safeBody, { new: true }
    )
      .populate('addedBy', 'name role')
      .populate('assignedTo', 'name role')
      .populate('assignedBy', 'name role');
    res.json(customer);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Close customer — sirf jis ko assign hua ho, ya admin
router.put('/:id/close', auth, async (req, res) => {
  try {
    const { role, id } = req.user
    const { note } = req.body

    const customer = await Customer.findById(req.params.id)
    if (!customer) return res.status(404).json({ message: 'Customer not found' });

    if (role !== 'admin' && String(customer.assignedTo) !== String(id)) {
      return res.status(403).json({ message: 'Not authorized to close this customer' });
    }
    if (customer.closed) {
      return res.status(400).json({ message: 'Customer already closed' });
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
    const { assignedTo, note } = req.body
    const { role, id } = req.user

    const existingCustomer = await Customer.findById(req.params.id)
    if (!existingCustomer) return res.status(404).json({ message: 'Customer not found' })

    // Jis ko assign kar rahe hain uska role check karo
    const assignee = await User.findById(assignedTo)
    if (!assignee) return res.status(404).json({ message: 'User not found' })

    // Admin ko assign nahi kar sakte
    if (assignee.role === 'admin') {
      return res.status(400).json({ message: 'Cannot assign to admin' })
    }

    // Flat hierarchy — no team structure except admin
    // Rules:
    // - admin: can assign to anyone (except admin which is already blocked)
    // - manager: can assign to jmanager, telecom, salesperson, other managers
    // - jmanager: can assign to telecom, salesperson, other jmanagers
    // - telecom/salesperson: can assign to peers OR to manager/jmanager
    if (role === 'manager') {
      if (!['manager', 'jmanager', 'telecom', 'salesperson'].includes(assignee.role)) {
        return res.status(403).json({ message: 'Not authorized to assign customers' })
      }
    } else if (role === 'jmanager') {
      if (!['jmanager', 'telecom', 'salesperson'].includes(assignee.role)) {
        return res.status(403).json({ message: 'Not authorized to assign customers' })
      }
    } else if (['telecom', 'salesperson'].includes(role)) {
      if (!['telecom', 'salesperson', 'manager', 'jmanager'].includes(assignee.role)) {
        return res.status(403).json({ message: 'Can only assign to peers or managers' })
      }
    } else if (role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to assign customers' })
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
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// Full timeline — assignment history + follow-ups, ek jagah, time order me
// Isi se pata chalta hai: kis ko pehle assign tha, kab, aur us waqt kya response tha
router.get('/:id/timeline', auth, async (req, res) => {
  try {
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
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

export default router;