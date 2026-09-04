import express from 'express';
import FollowUp from '../models/FollowUp.js';
import Customer from '../models/Customer.js';
import { createNotification } from '../utils/notify.js';
import asyncHandler from '../utils/asyncHandler.js';
import AppError from '../utils/AppError.js';
import logger from '../utils/logger.js';

const router = express.Router();

// Vercel's Hobby plan only allows once-per-day cron schedules (see vercel.json),
// so the lookahead window is 24h — wide enough that a single daily run catches
// everything due "today" regardless of what time the run actually fires.
// (Pro plan users can drop this to hourly and shrink the window accordingly.)
const REMINDER_WINDOW_HOURS = 24;

// Vercel Cron Jobs automatically send `Authorization: Bearer <CRON_SECRET>`,
// using the CRON_SECRET env var you set in the Vercel project settings — this
// is the only thing standing between this route and the public internet, since
// it can't require a normal user JWT.
router.get(
  '/reminders',
  asyncHandler(async (req, res) => {
    if (process.env.CRON_SECRET) {
      const authHeader = req.headers.authorization;
      if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        throw new AppError('Unauthorized', 401);
      }
    }

    const windowEnd = new Date(Date.now() + REMINDER_WINDOW_HOURS * 60 * 60 * 1000);

    // Only the MOST RECENT follow-up per customer represents the current
    // "next call" — earlier follow-ups may carry a stale nextCallDate that a
    // later follow-up has already superseded.
    const dueFollowUps = await FollowUp.aggregate([
      { $sort: { customer: 1, createdAt: -1 } },
      { $group: { _id: '$customer', latest: { $first: '$$ROOT' } } },
      { $replaceRoot: { newRoot: '$latest' } },
      { $match: { nextCallDate: { $ne: null, $lte: windowEnd }, reminderSent: { $ne: true } } },
    ]);

    let notified = 0;

    for (const followUp of dueFollowUps) {
      const customer = await Customer.findById(followUp.customer);

      // Nothing actionable left (closed / already sold / already lost / unassigned)
      // — mark it sent anyway so it isn't rechecked on every future run forever.
      if (!customer || customer.closed || ['sale', 'lost'].includes(customer.status) || !customer.assignedTo) {
        await FollowUp.findByIdAndUpdate(followUp._id, { reminderSent: true });
        continue;
      }

      await createNotification({
        user: customer.assignedTo,
        type: 'followup_reminder',
        title: 'Follow-up due',
        message: `Follow-up with ${customer.name} (${customer.phone}) is due soon.`,
        relatedCustomer: customer._id,
        relatedFollowUp: followUp._id,
      });

      await FollowUp.findByIdAndUpdate(followUp._id, { reminderSent: true });
      notified += 1;
    }

    logger.info('Reminder cron run complete', { checked: dueFollowUps.length, notified });
    res.json({ checked: dueFollowUps.length, notified });
  })
);

export default router;
