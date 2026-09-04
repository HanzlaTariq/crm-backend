import mongoose from 'mongoose';

const followUpSchema = new mongoose.Schema({
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  doneBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  note: { type: String, required: true },
  status: {
    type: String,
    enum: ['interested', 'not-interested', 'followup', 'sale', 'lost'],
    required: true
  },
  nextCallDate: { type: Date }
}, { timestamps: true });

followUpSchema.index({ customer: 1, createdAt: -1 });
followUpSchema.index({ doneBy: 1 });
followUpSchema.index({ nextCallDate: 1 });

export default mongoose.model('FollowUp', followUpSchema);
