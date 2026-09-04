import Activity from '../models/Activity.js';
import logger from './logger.js';

// Same fire-and-forget contract as notify.js — logging an activity should never
// be able to fail the request that triggered it.
export const logActivity = async ({ actor, action, targetType = null, targetId = null, description, meta = {} }) => {
  try {
    if (!actor || !description) return null;
    return await Activity.create({ actor, action, targetType, targetId, description, meta });
  } catch (err) {
    logger.error('Failed to log activity', { error: err.message, action, actor: String(actor) });
    return null;
  }
};

export default logActivity;
