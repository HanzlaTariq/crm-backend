import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import auth from '../middleware/auth.js';
import requireRole from '../middleware/requireRole.js';
import validate from '../middleware/validate.js';
import asyncHandler from '../utils/asyncHandler.js';
import AppError from '../utils/AppError.js';
import { registerSchema, loginSchema, updateUserSchema, idParamSchema } from '../validators/authValidators.js';
import { loginLimiter, registerLimiter } from '../middleware/rateLimiters.js';

const router = express.Router();

// Register — ADMIN ONLY.
// SECURITY FIX (Phase 1): this route previously had no auth check at all, meaning
// anyone on the internet could POST here, set role: "admin" in the body, and create
// a fully-privileged account. The only real caller is the Team page, which is already
// gated to admins on the frontend — this just enforces the same rule server-side.
router.post(
  '/register',
  registerLimiter,
  auth,
  requireRole('admin'),
  validate({ body: registerSchema }),
  asyncHandler(async (req, res) => {
    const { name, email, password, role, managerId } = req.body;

    const exists = await User.findOne({ email });
    if (exists) throw new AppError('Email already exists', 409);

    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({
      name,
      email,
      password: hashed,
      role,
      manager: managerId || null,
    });

    const userObj = user.toObject();
    delete userObj.password;

    res.status(201).json({ message: 'User created ✅', user: userObj });
  })
);

// Login
router.post(
  '/login',
  loginLimiter,
  validate({ body: loginSchema }),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) throw new AppError('Invalid credentials', 400);

    if (!user.isActive) throw new AppError('This account has been deactivated', 403);

    const match = await bcrypt.compare(password, user.password);
    if (!match) throw new AppError('Invalid credentials', 400);

    const token = jwt.sign(
      { id: user._id, role: user.role, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ token, user: { id: user._id, name: user.name, role: user.role } });
  })
);

// Update user — admin only
router.put(
  '/user/:id',
  auth,
  requireRole('admin'),
  validate({ params: idParamSchema, body: updateUserSchema }),
  asyncHandler(async (req, res) => {
    const { name, email, role, managerId } = req.body;

    const update = {};
    if (name !== undefined) update.name = name;
    if (email !== undefined) update.email = email;
    if (role !== undefined) update.role = role;
    if (managerId !== undefined) update.manager = managerId || null;

    const user = await User.findByIdAndUpdate(req.params.id, update, { new: true })
      .select('-password')
      .populate('manager', 'name role');

    if (!user) throw new AppError('User not found', 404);
    res.json(user);
  })
);

export default router;
