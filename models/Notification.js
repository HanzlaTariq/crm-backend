import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: {
    type: String,
    enum: ['assignment', 'reassignment', 'followup_reminder', 'bulk_assignment'],
    required: true,
  },
  title: { type: String, required: true },
  message: { type: String, required: true },
  relatedCustomer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
  relatedFollowUp: { type: mongoose.Schema.Types.ObjectId, ref: 'FollowUp', default: null },
  isRead: { type: Boolean, default: false },
  readAt: { type: Date, default: null },
}, { timestamps: true });

// Bell dropdown always queries "my notifications, newest first" and
// "my unread count" — this index covers both.
notificationSchema.index({ user: 1, isRead: 1, createdAt: -1 });

export default mongoose.model('Notification', notificationSchema);
