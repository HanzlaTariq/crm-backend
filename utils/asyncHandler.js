// Wraps an async route handler so any thrown/rejected error is forwarded
// to Express's error-handling middleware instead of crashing the process
// or requiring a try/catch in every single route.
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

export default asyncHandler;
