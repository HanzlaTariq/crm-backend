import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import customerRoutes from './routes/customers.js';
import followupRoutes from './routes/followups.js';
import userRoutes from './routes/users.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';
import { generalLimiter } from './middleware/rateLimiters.js';
import logger from './utils/logger.js';

dotenv.config();

const app = express();

// Trust proxy — required on Vercel (and behind any reverse proxy) so
// express-rate-limit and req.ip see the real client IP, not the proxy's.
app.set('trust proxy', 1);

// Security headers
app.use(helmet());

// CORS — locked down to actual frontend origin(s) via env var instead of '*'.
// FRONTEND_URL can be a single origin or a comma-separated list, e.g.
// "https://crm.example.com,https://staging-crm.example.com"
// Falls back to localhost dev origins if not set, so local dev keeps working.
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173,http://localhost:3000')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (curl, server-to-server, mobile apps, Postman)
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    logger.warn('Blocked CORS request', { origin });
    return callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Request logging — concise dev format locally, nothing extra in prod
// (prod request-level logging can get noisy/costly on serverless; rely on
// the structured logger for warnings/errors instead).
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

app.use(express.json());

// General rate limiting across the whole API
app.use('/api', generalLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/followups', followupRoutes);
app.use('/api/users', userRoutes);

// Test route
app.get('/', (req, res) => {
  res.json({ message: 'CRM API Running ✅' });
});

// 404 + centralized error handler — must be registered after all routes
app.use(notFound);
app.use(errorHandler);

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    logger.info('MongoDB Connected ✅');
    app.listen(process.env.PORT || 5000, () => {
      logger.info(`Server running on port ${process.env.PORT || 5000}`);
    });
  })
  .catch((err) => logger.error('MongoDB connection failed', { error: err.message }));

export default app;
