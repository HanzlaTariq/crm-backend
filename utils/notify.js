import Notification from '../models/Notification.js';
import logger from './logger.js';

// A failed notification write should never fail the request that triggered it
// (e.g. assigning a customer must still succeed even if this insert fails) —
// so this swallows its own errors and just logs them.
export const createNotification = async ({
  user,
  type,
  title,
  message,
  relatedCustomer = null,
  relatedFollowUp = null,
}) => {
  try {
    if (!user) return null;
    return await Notification.create({ user, type, title, message, relatedCustomer, relatedFollowUp });
  } catch (err) {
    logger.error('Failed to create notification', { error: err.message, type, user: String(user) });
    return null;
  }
};

export const createNotifications = (items) => Promise.all(items.map(createNotification));

export default createNotification;
