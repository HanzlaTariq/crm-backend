import express from 'express';
import User from '../models/User.js';
import auth from '../middleware/auth.js';

const router = express.Router();

// Get team — role based
router.get('/', auth, async (req, res) => {
  try {
    const { role, id } = req.user

    let users;

    if (role === 'admin') {
      // Admin — sab dekhe
      users = await User.find()
        .select('-password')
        .populate('manager', 'name role')
        .sort({ createdAt: -1 });
    } else {
      // All non-admin roles (manager, jmanager, telecom, salesperson) see all users except admin
      users = await User.find({ role: { $ne: 'admin' } })
        .select('-password')
        .populate('manager', 'name role')
        .sort({ createdAt: -1 });
    }

    res.json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get all managers/jmanagers for dropdown
router.get('/assignable', auth, async (req, res) => {
  try {
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
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;