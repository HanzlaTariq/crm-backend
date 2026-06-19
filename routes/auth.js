import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import auth from '../middleware/auth.js';

const router = express.Router();

// Register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role, managerId } = req.body;
    const normalizedEmail = email.trim().toLowerCase();

    const exists = await User.findOne({ email: normalizedEmail });
    if (exists) return res.status(400).json({ message: 'Email already exists' });

    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({ 
      name,
      email: normalizedEmail,
      password: hashed, 
      role,
      manager: managerId || null
    });

    const userObj = user.toObject();
    delete userObj.password;

    res.status(201).json({ message: 'User created ✅', user: userObj });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = email.trim().toLowerCase();

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) return res.status(400).json({ message: 'Invalid credentials' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ message: 'Invalid credentials' });

    const token = jwt.sign(
      { id: user._id, role: user.role, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ token, user: { id: user._id, name: user.name, role: user.role } });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Update user — admin only
router.put('/user/:id', auth, async (req, res) => {
  try {
    const { role, id } = req.user;
    if (role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const { name, email, role: newRole, managerId } = req.body;
    const user = await User.findByIdAndUpdate(
      req.params.id,
      {
        name,
        email: email ? email.trim().toLowerCase() : undefined,
        role: newRole,
        manager: managerId || null
      },
      { new: true }
    )
      .select('-password')
      .populate('manager', 'name role');

    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;