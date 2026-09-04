import rateLimit from 'express-rate-limit';

// General safety net across the whole API — generous, just there to blunt
// scraping/abuse. Shouldn't be noticeable to real users.
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.' },
});

// Tighter limiter specifically for login — this is the endpoint brute-force
// attacks actually target. 10 attempts / 15 min per IP, keyed by IP+email so
// one person mistyping their password repeatedly doesn't lock out the whole office.
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${req.ip}:${(req.body?.email || '').toLowerCase()}`,
  message: { success: false, message: 'Too many login attempts. Please try again in 15 minutes.' },
});

// Registration is admin-only (see routes/auth.js) but still worth capping.
export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many accounts created from this IP, please try again later.' },
});
