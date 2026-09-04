import jwt from 'jsonwebtoken';

const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ success: false, message: 'No token, unauthorized' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    // Let the central error handler translate JsonWebTokenError / TokenExpiredError
    // into the right message, so token-expiry vs. tampering is distinguishable.
    next(err);
  }
};

export default auth;
