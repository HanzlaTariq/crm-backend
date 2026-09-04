import express from 'express';
import Customer from '../models/Customer.js';
import User from '../models/User.js';
import auth from '../middleware/auth.js';
import validate from '../middleware/validate.js';
import asyncHandler from '../utils/asyncHandler.js';
import { getTeamIds } from '../utils/teamScope.js';
import { analyticsQuerySchema } from '../validators/dashboardValidators.js';

const router = express.Router();

const PERIOD_CONFIG = {
  week: { days: 7, granularity: 'day' },
  month: { days: 30, granularity: 'day' },
  year: { days: 365, granularity: 'month' },
};

const formatKey = (date, granularity) =>
  granularity === 'month' ? date.toISOString().slice(0, 7) : date.toISOString().slice(0, 10);

// Zero-fills every day/month in the window so the chart never has a gap just
// because nothing happened that day — the frontend can plot this directly.
const buildEmptySeries = (start, granularity) => {
  const series = [];
  const cursor = new Date(start);
  const now = new Date();
  while (cursor <= now) {
    series.push(formatKey(cursor, granularity));
    if (granularity === 'month') cursor.setMonth(cursor.getMonth() + 1);
    else cursor.setDate(cursor.getDate() + 1);
  }
  return series;
};

// Analytics for charts: leads-over-time, status breakdown, conversion rate,
// per-user performance — all scoped by the same role-hierarchy rules as
// GET /customers/stats/summary (via the shared getTeamIds helper), so an
// admin sees company-wide numbers and everyone else sees only their own scope.
router.get('/analytics', auth, validate({ query: analyticsQuerySchema }), asyncHandler(async (req, res) => {
  const { role, id } = req.user;
  const { period } = req.query;
  const { days, granularity } = PERIOD_CONFIG[period];

  const start = new Date();
  start.setDate(start.getDate() - days);
  start.setHours(0, 0, 0, 0);

  const teamIds = await getTeamIds(id, role);
  const scopeQuery = teamIds ? { $or: [{ addedBy: { $in: teamIds } }, { assignedTo: { $in: teamIds } }] } : {};
  const dateFormat = granularity === 'month' ? '%Y-%m' : '%Y-%m-%d';

  const [leadsOverTimeRaw, statusBreakdownRaw, perUserRaw, totalAllTime, totalInRange] = await Promise.all([
    Customer.aggregate([
      { $match: { ...scopeQuery, createdAt: { $gte: start } } },
      { $group: { _id: { $dateToString: { format: dateFormat, date: '$createdAt' } }, count: { $sum: 1 } } },
    ]),
    Customer.aggregate([
      { $match: scopeQuery },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    Customer.aggregate([
      { $match: { ...scopeQuery, assignedTo: { $ne: null } } },
      {
        $group: {
          _id: '$assignedTo',
          total: { $sum: 1 },
          sale: { $sum: { $cond: [{ $eq: ['$status', 'sale'] }, 1, 0] } },
          lost: { $sum: { $cond: [{ $eq: ['$status', 'lost'] }, 1, 0] } },
        },
      },
      { $sort: { total: -1 } },
      { $limit: 50 },
    ]),
    Customer.countDocuments(scopeQuery),
    Customer.countDocuments({ ...scopeQuery, createdAt: { $gte: start } }),
  ]);

  const countsByKey = Object.fromEntries(leadsOverTimeRaw.map((d) => [d._id, d.count]));
  const leadsOverTime = buildEmptySeries(start, granularity).map((key) => ({
    date: key,
    count: countsByKey[key] || 0,
  }));

  const statusBreakdown = statusBreakdownRaw.map((s) => ({ status: s._id, count: s.count }));
  const totalSale = statusBreakdown.find((s) => s.status === 'sale')?.count || 0;
  const conversionRate = totalAllTime > 0 ? Number(((totalSale / totalAllTime) * 100).toFixed(1)) : 0;

  const users = await User.find({ _id: { $in: perUserRaw.map((u) => u._id) } }).select('name role');
  const usersById = Object.fromEntries(users.map((u) => [String(u._id), u]));

  const perUserPerformance = perUserRaw.map((u) => {
    const info = usersById[String(u._id)];
    return {
      userId: u._id,
      name: info?.name || 'Unknown',
      role: info?.role || 'unknown',
      total: u.total,
      sale: u.sale,
      lost: u.lost,
      conversionRate: u.total > 0 ? Number(((u.sale / u.total) * 100).toFixed(1)) : 0,
    };
  });

  res.json({
    period,
    leadsOverTime,
    statusBreakdown,
    conversionRate,
    totalAllTime,
    totalInRange,
    perUserPerformance,
  });
}));

export default router;
