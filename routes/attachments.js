import express from 'express';
import Customer from '../models/Customer.js';
import Attachment from '../models/Attachment.js';
import auth from '../middleware/auth.js';
import validate from '../middleware/validate.js';
import upload from '../middleware/upload.js';
import asyncHandler from '../utils/asyncHandler.js';
import AppError from '../utils/AppError.js';
import { uploadBufferToCloudinary, deleteFromCloudinary } from '../utils/cloudinary.js';
import { logActivity } from '../utils/activityLogger.js';
import { customerIdParamSchema, attachmentIdParamSchema } from '../validators/attachmentValidators.js';

const router = express.Router();

// Same visibility rule the rest of the customer API uses: admin sees/does
// everything, everyone else only for customers assigned to them.
const canAccessCustomer = (customer, user) =>
  user.role === 'admin' || String(customer.assignedTo) === String(user.id);

const resourceTypeFor = (mimetype) => (mimetype.startsWith('image/') ? 'image' : 'raw');

router.get('/:customerId', auth, validate({ params: customerIdParamSchema }), asyncHandler(async (req, res) => {
  const customer = await Customer.findById(req.params.customerId);
  if (!customer) throw new AppError('Customer not found', 404);
  if (!canAccessCustomer(customer, req.user)) throw new AppError('Not authorized to view this customer', 403);

  const attachments = await Attachment.find({ customer: customer._id })
    .populate('uploadedBy', 'name role')
    .sort({ createdAt: -1 });

  res.json(attachments);
}));

router.post(
  '/:customerId',
  auth,
  validate({ params: customerIdParamSchema }),
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const customer = await Customer.findById(req.params.customerId);
    if (!customer) throw new AppError('Customer not found', 404);
    if (!canAccessCustomer(customer, req.user)) throw new AppError('Not authorized to upload to this customer', 403);
    if (!req.file) throw new AppError('No file uploaded', 400);

    const resourceType = resourceTypeFor(req.file.mimetype);
    const result = await uploadBufferToCloudinary(req.file.buffer, {
      folder: `crm/customers/${customer._id}`,
      resourceType,
      filename: req.file.originalname,
    });

    const attachment = await Attachment.create({
      customer: customer._id,
      uploadedBy: req.user.id,
      fileName: req.file.originalname,
      fileType: req.file.mimetype,
      fileSize: req.file.size,
      url: result.secure_url,
      publicId: result.public_id,
      resourceType,
    });

    logActivity({
      actor: req.user.id,
      action: 'attachment_uploaded',
      targetType: 'Customer',
      targetId: customer._id,
      description: `${req.user.name} uploaded "${req.file.originalname}" for ${customer.name}`,
    });

    res.status(201).json(attachment);
  })
);

router.delete('/:id', auth, validate({ params: attachmentIdParamSchema }), asyncHandler(async (req, res) => {
  const attachment = await Attachment.findById(req.params.id).populate('customer');
  if (!attachment) throw new AppError('Attachment not found', 404);
  if (!canAccessCustomer(attachment.customer, req.user)) throw new AppError('Not authorized to delete this attachment', 403);

  await deleteFromCloudinary(attachment.publicId, attachment.resourceType);
  await attachment.deleteOne();

  logActivity({
    actor: req.user.id,
    action: 'attachment_deleted',
    targetType: 'Customer',
    targetId: attachment.customer._id,
    description: `${req.user.name} deleted attachment "${attachment.fileName}"`,
  });

  res.json({ message: 'Attachment deleted' });
}));

export default router;
