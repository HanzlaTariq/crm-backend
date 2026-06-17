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

    } else if (role === 'manager') {
      // Manager — apne directly neeche wale (jmanager) + unke neeche wale
      const jmanagers = await User.find({ manager: id }).select('_id')
      const jmanagerIds = jmanagers.map(j => j._id)

      const bottomLevel = await User.find({ 
        manager: { $in: jmanagerIds } 
      }).select('_id')
      const bottomIds = bottomLevel.map(b => b._id)

      users = await User.find({
        _id: { $in: [...jmanagerIds, ...bottomIds] }
      })
        .select('-password')
        .populate('manager', 'name role')
        .sort({ createdAt: -1 });

    } else if (role === 'jmanager') {
      // J.Manager — sirf apne directly neeche wale
      users = await User.find({ manager: id })
        .select('-password')
        .populate('manager', 'name role')
        .sort({ createdAt: -1 });

    } else {
      users = [];
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