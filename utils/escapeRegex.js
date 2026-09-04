// Escapes user input before it's used inside a MongoDB regex query,
// so search text like "a.b*c" is treated literally instead of as regex syntax.
const escapeRegex = (str = '') => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export default escapeRegex;
