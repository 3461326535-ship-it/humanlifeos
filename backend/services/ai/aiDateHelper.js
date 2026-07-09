// Date helper — uses LOCAL time, not UTC
// Fixes the timezone bug where new Date().toISOString() returns UTC date
// while event dates are stored in local time.

/**
 * Get today's date in local timezone (YYYY-MM-DD)
 */
function getToday() {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0')
  ].join('-');
}

/**
 * Add N days to a date string, returns YYYY-MM-DD
 */
function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d + days);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
}

/**
 * Get the start and end of the current week (Mon-Sun) in local time
 */
function getWeekRange() {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    start: [monday.getFullYear(), String(monday.getMonth() + 1).padStart(2, '0'), String(monday.getDate()).padStart(2, '0')].join('-'),
    end: [sunday.getFullYear(), String(sunday.getMonth() + 1).padStart(2, '0'), String(sunday.getDate()).padStart(2, '0')].join('-')
  };
}

module.exports = { getToday, addDays, getWeekRange };
