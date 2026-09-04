// Custom error class for known/expected failures (bad input, not found, forbidden, etc).
// Anything thrown as AppError is treated as a "safe" error whose message can be
// shown to the client as-is. Anything else (bugs, DB blowups) is logged in full
// but shown to the client as a generic message.
class AppError extends Error {
  constructor(message, statusCode = 400, errors = undefined) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors; // optional array of field-level error details
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export default AppError;
