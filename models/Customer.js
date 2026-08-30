import mongoose from 'mongoose';

const customerSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: String, required: true },
  email: { type: String },
  address: { type: String },
  status: {
    type: String,
    enum: ['new', 'interested', 'not-interested', 'followup', 'sale', 'lost'],
    default: 'new'
  },
  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  notes: { type: String },
  closed: { type: Boolean, default: false },
  closedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  closedAt: { type: Date, default: null },
  closeNote: { type: String, default: '' },
}, { timestamps: true });

export default mongoose.model('Customer', customerSchema);