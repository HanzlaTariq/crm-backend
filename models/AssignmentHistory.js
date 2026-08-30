import mongoose from 'mongoose';

// Har assign/reassign action ka permanent record.
// Customer.assignedTo overwrite hota hai, lekin ye collection kabhi overwrite nahi hoti —
// isi se pura "kis ko pehle assign tha, kab, kis ne assign kiya" trail milta hai.
const assignmentHistorySchema = new mongoose.Schema({
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
  fromUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, // null = pehli assignment
  toUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  note: { type: String, default: '' },
}, { timestamps: true });

export default mongoose.model('AssignmentHistory', assignmentHistorySchema);