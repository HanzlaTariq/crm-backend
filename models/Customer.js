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

// Support fast lookup/search/filter/sort combinations used by GET /customers
customerSchema.index({ phone: 1 });
customerSchema.index({ email: 1 });
customerSchema.index({ status: 1 });
customerSchema.index({ assignedTo: 1 });
customerSchema.index({ addedBy: 1 });
customerSchema.index({ closed: 1 });
customerSchema.index({ createdAt: -1 });

export default mongoose.model('Customer', customerSchema);
