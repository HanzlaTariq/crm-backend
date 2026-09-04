import AppError from '../utils/AppError.js';

// Usage: router.post('/', auth, requireRole('admin'), handler)
const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return next(new AppError('Not authorized', 403));
  }
  next();
};

export default requireRole;
