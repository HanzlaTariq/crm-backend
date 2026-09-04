import logger from '../utils/logger.js';

// Consistent JSON error shape across the whole API:
// { success: false, message: string, errors?: [{ field, message }] }

// 404 handler — must be registered AFTER all routes, BEFORE errorHandler.
export const notFound = (req, res, next) => {
  res.status(404);
  next(new Error(`Route not found - ${req.originalUrl}`));
};

// Central error handler — must be registered LAST (4 args = Express treats it as error middleware).
// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || (res.statusCode !== 200 ? res.statusCode : 500);
  let message = err.message || 'Server error';
  let errors = err.errors;

  // Mongoose bad ObjectId (e.g. /customers/not-a-real-id)
  if (err.name === 'CastError') {
    statusCode = 400;
    message = `Invalid ${err.path}: ${err.value}`;
    errors = undefined;
  }

  // Mongoose duplicate key (e.g. email already exists via a race condition)
  if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    message = `${field} already in use`;
    errors = undefined;
  }

  // Mongoose schema validation error (belt-and-suspenders alongside Zod)
  if (err.name === 'ValidationError' && err.errors) {
    statusCode = 400;
    message = 'Validation failed';
    errors = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token';
  }
  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expired, please log in again';
  }

  // Log full detail server-side always; only expose safe info to the client.
  if (statusCode >= 500) {
    logger.error(message, { stack: err.stack, path: req.originalUrl, method: req.method });
  } else {
    logger.warn(message, { path: req.originalUrl, method: req.method, statusCode });
  }

  res.status(statusCode).json({
    success: false,
    message: statusCode >= 500 && process.env.NODE_ENV === 'production' ? 'Server error' : message,
    ...(errors ? { errors } : {}),
  });
};
