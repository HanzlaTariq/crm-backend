import express from 'express';
import Notification from '../models/Notification.js';
import auth from '../middleware/auth.js';
import validate from '../middleware/validate.js';
import asyncHandler from '../utils/asyncHandler.js';
import AppError from '../utils/AppError.js';
import { listNotificationsQuerySchema, notificationIdParamSchema } from '../validators/notificationValidators.js';

const router = express.Router();

// Every route here is scoped to req.user.id only — notifications are always
// "mine", regardless of role. No admin override; there's no legitimate reason
// for anyone to read someone else's notification feed.

router.get('/', auth, validate({ query: listNotificationsQuerySchema }), asyncHandler(async (req, res) => {
  const { page, limit, unreadOnly } = req.query;
  const query = { user: req.user.id, ...(unreadOnly ? { isRead: false } : {}) };
  const skip = (page - 1) * limit;

  const [notifications, totalCount, unreadCount] = await Promise.all([
    Notification.find(query)
      .populate('relatedCustomer', 'name phone status')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Notification.countDocuments(query),
    Notification.countDocuments({ user: req.user.id, isRead: false }),
  ]);

  res.set({
    'X-Total-Count': String(totalCount),
    'X-Total-Pages': String(Math.max(1, Math.ceil(totalCount / limit))),
    'X-Page': String(page),
    'X-Limit': String(limit),
  });
  res.json({ notifications, unreadCount });
}));

// Lightweight endpoint for the notification bell badge — no need to fetch the
// whole list just to know if there's anything unread.
router.get('/unread-count', auth, asyncHandler(async (req, res) => {
  const unreadCount = await Notification.countDocuments({ user: req.user.id, isRead: false });
  res.json({ unreadCount });
}));

router.put('/:id/read', auth, validate({ params: notificationIdParamSchema }), asyncHandler(async (req, res) => {
  const notification = await Notification.findOne({ _id: req.params.id, user: req.user.id });
  if (!notification) throw new AppError('Notification not found', 404);

  notification.isRead = true;
  notification.readAt = new Date();
  await notification.save();

  res.json(notification);
}));

router.put('/read-all', auth, asyncHandler(async (req, res) => {
  await Notification.updateMany(
    { user: req.user.id, isRead: false },
    { $set: { isRead: true, readAt: new Date() } }
  );
  res.json({ message: 'All notifications marked as read' });
}));

export default router;
