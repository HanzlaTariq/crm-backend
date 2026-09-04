import mongoose from 'mongoose';

// Generic activity feed — broader than AssignmentHistory (which only ever
// tracks who-was-assigned-what). This covers logins, edits, closes, bulk
// actions, attachments, etc. `description` is a precomputed human-readable
// line so the frontend can render the feed without stitching strings together.
const activitySchema = new mongoose.Schema({
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  action: {
    type: String,
    enum: [
      'login',
      'customer_created',
      'customer_updated',
      'customer_closed',
      'customer_deleted',
      'customer_exported',
      'customer_assigned',
      'customer_reassigned',
      'bulk_assign',
      'bulk_status_update',
      'followup_created',
      'user_created',
      'user_updated',
      'attachment_uploaded',
      'attachment_deleted',
    ],
    required: true,
  },
  targetType: { type: String, enum: ['Customer', 'User', 'FollowUp', 'Attachment', null], default: null },
  targetId: { type: mongoose.Schema.Types.ObjectId, default: null },
  description: { type: String, required: true },
  meta: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

activitySchema.index({ createdAt: -1 });
activitySchema.index({ actor: 1, createdAt: -1 });
activitySchema.index({ action: 1 });

export default mongoose.model('Activity', activitySchema);
