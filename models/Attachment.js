import mongoose from 'mongoose';

const attachmentSchema = new mongoose.Schema({
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  fileName: { type: String, required: true },
  fileType: { type: String, required: true }, // mimetype
  fileSize: { type: Number, required: true }, // bytes
  url: { type: String, required: true }, // Cloudinary secure_url
  publicId: { type: String, required: true }, // Cloudinary public_id — needed to delete later
  resourceType: { type: String, enum: ['image', 'raw', 'video'], default: 'raw' },
}, { timestamps: true });

attachmentSchema.index({ customer: 1, createdAt: -1 });

export default mongoose.model('Attachment', attachmentSchema);
