import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  role: {
    type: String,
    enum: ['admin', 'manager', 'jmanager', 'telecom', 'salesperson'],
    default: 'salesperson'
  },
  manager: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    default: null 
  },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

export default mongoose.model('User', userSchema);