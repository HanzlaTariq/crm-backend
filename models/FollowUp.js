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

export default mongoose.model('FollowUp', followUpSchema);