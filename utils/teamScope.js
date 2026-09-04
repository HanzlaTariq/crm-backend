import User from '../models/User.js';

// Extracted from routes/customers.js (Phase 1) so it can also be reused by the
// Phase 2 dashboard analytics endpoint. Logic is unchanged — same hierarchy
// rules that already power GET /customers/stats/summary.
//
// Returns an array of user IDs "under" this user for stats-scoping purposes,
// or null for admin (null = no restriction, see all).
export const getTeamIds = async (userId, role) => {
  if (role === 'admin') return null; // null = sab

  if (role === 'manager') {
    const jmanagers = await User.find({ manager: userId }).select('_id');
    const jmanagerIds = jmanagers.map((j) => j._id);
    const bottom = await User.find({ manager: { $in: jmanagerIds } }).select('_id');
    const bottomIds = bottom.map((b) => b._id);
    return [userId, ...jmanagerIds, ...bottomIds];
  }

  if (role === 'jmanager') {
    const bottom = await User.find({ manager: userId }).select('_id');
    const bottomIds = bottom.map((b) => b._id);
    return [userId, ...bottomIds];
  }

  // telecom / salesperson — sirf apna
  return [userId];
};

export default getTeamIds;
