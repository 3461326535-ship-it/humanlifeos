// Layer 6: Scheduler (v2.0.3)
// Intelligent time-slot distribution for tasks.
//
// DETERMINISTIC — no LLM call. Pure algorithm that replaces
// hardcoded "09:00" defaults with smart time allocation.
//
// Rules:
// 1. Working hours: 09:00–12:00, 14:00–18:00 (7 × 1‑hour slots/day)
// 2. Tasks on the same day get spread across available slots
// 3. If more tasks than slots → overflow to next available working day
// 4. Already-explicitly-timed tasks (not "09:00") are respected & block their slot
// 5. Category hint: 工作 → morning preference, 生活 → afternoon, 其他 → fill

// ── Config ──────────────────────────────────────────────
const MORNING_SLOTS  = ['09:00', '10:00', '11:00'];           // 3 slots
const AFTERNOON_SLOTS = ['14:00', '15:00', '16:00', '17:00'];  // 4 slots
const ALL_SLOTS = [...MORNING_SLOTS, ...AFTERNOON_SLOTS];      // 7 total
const DEFAULT_TIME = '09:00';

const CATEGORY_PREFERENCE = {
  '工作':     { prefer: 'morning', morning: MORNING_SLOTS, afternoon: AFTERNOON_SLOTS },
  '生活':     { prefer: 'afternoon', morning: MORNING_SLOTS, afternoon: AFTERNOON_SLOTS },
  '其他':     { prefer: 'any', morning: MORNING_SLOTS, afternoon: AFTERNOON_SLOTS },
  // backward compat (legacy data may still have English names)
  Sales:     { prefer: 'morning', morning: MORNING_SLOTS, afternoon: AFTERNOON_SLOTS },
  Marketing: { prefer: 'afternoon', morning: MORNING_SLOTS, afternoon: AFTERNOON_SLOTS },
  Other:     { prefer: 'any', morning: MORNING_SLOTS, afternoon: AFTERNOON_SLOTS },
};

// ── Helpers ─────────────────────────────────────────────

/** Parse "HH:MM" to minutes since midnight */
function timeToMinutes(t) {
  const [h, m] = (t || DEFAULT_TIME).split(':').map(Number);
  return h * 60 + m;
}

/** Format minutes to "HH:MM" */
function minutesToTime(m) {
  const h = Math.floor(m / 60), mm = m % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/** Add N calendar days to a date string (YYYY-MM-DD), returns same format */
function addCalendarDays(dateStr, days) {
  if (days === 0) return dateStr;
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d + days);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
}

// ── Main API ────────────────────────────────────────────

/**
 * Schedule tasks with intelligent time distribution.
 *
 * @param {Array} tasks — [{title, date, time?, category?, ...}]
 *   Tasks with time already set (and !== "09:00") are treated as fixed.
 * @param {object} [opts]
 * @param {number} [opts.maxPerDay=7] — max tasks per day before overflow
 * @param {boolean} [opts.overflowToNextDay=true] — push extra tasks to next day
 * @returns {Array} — same tasks with `time` and possibly `date` updated
 */
function schedule(tasks, opts = {}) {
  const maxPerDay = opts.maxPerDay || ALL_SLOTS.length; // 7
  const overflow = opts.overflowToNextDay !== false;

  // 1. Separate fixed (user-specified time) vs auto (needs scheduling)
  const fixed  = [];  // already has a real time
  const auto   = [];  // needs scheduling

  tasks.forEach((t, i) => {
    if (t.time && t.time !== DEFAULT_TIME && t.time !== '') {
      fixed.push({ ...t, _idx: i });
    } else {
      auto.push({ ...t, _idx: i });
    }
  });

  // 2. Group auto tasks by date; gather blocked slots from fixed tasks
  const byDate = {};       // date → auto tasks
  const blockedByDate = {}; // date → Set of blocked slot indices

  auto.forEach(t => {
    const d = t.date;
    if (!byDate[d]) byDate[d] = [];
    byDate[d].push(t);
  });

  fixed.forEach(t => {
    const d = t.date;
    if (!blockedByDate[d]) blockedByDate[d] = new Set();
    // Mark the nearest slot as blocked
    const slotIdx = findNearestSlot(t.time);
    if (slotIdx >= 0) blockedByDate[d].add(slotIdx);
  });

  // 3. Assign times per date
  const overflowed = []; // tasks that couldn't fit on their date

  Object.keys(byDate).forEach(date => {
    let dayTasks = byDate[date];
    const blocked = blockedByDate[date] || new Set();

    // Sort: category preference
    dayTasks.sort((a, b) => {
      const prefA = CATEGORY_PREFERENCE[a.category]?.prefer || 'any';
      const prefB = CATEGORY_PREFERENCE[b.category]?.prefer || 'any';
      if (prefA === 'morning' && prefB !== 'morning') return -1;
      if (prefB === 'morning' && prefA !== 'morning') return 1;
      if (prefA === 'afternoon' && prefB === 'any') return -1;
      return 0;
    });

    // Build available slot list for this day
    const available = [];
    for (let i = 0; i < ALL_SLOTS.length; i++) {
      if (!blocked.has(i)) available.push(i);
    }

    // Assign
    const assigned = [];
    const leftover = [];

    dayTasks.forEach(t => {
      if (available.length > 0) {
        const slotIdx = pickBestSlot(t, available);
        t.time = ALL_SLOTS[slotIdx];
        // Remove from available
        const pos = available.indexOf(slotIdx);
        if (pos >= 0) available.splice(pos, 1);
        assigned.push(t);
      } else {
        leftover.push(t);
      }
    });

    // Handle overflow
    if (leftover.length > 0 && overflow) {
      leftover.forEach((t, i) => {
        const dayOffset = Math.floor(i / maxPerDay) + 1;
        t.date = addCalendarDays(date, dayOffset);
        t.time = ALL_SLOTS[i % ALL_SLOTS.length];
      });
    } else if (leftover.length > 0) {
      // No overflow — force-fit: reuse slots with +1h offsets
      leftover.forEach((t, i) => {
        t.time = minutesToTime(timeToMinutes(ALL_SLOTS[i % ALL_SLOTS.length]) + 30);
      });
      assigned.push(...leftover);
    }
  });

  // 4. Merge everything back in original order
  const result = new Array(tasks.length);
  fixed.forEach(t => { result[t._idx] = t; });
  auto.forEach(t => { result[t._idx] = t; });

  return result.filter(Boolean);
}

/** Find the nearest time slot index for a given time string */
function findNearestSlot(time) {
  const mins = timeToMinutes(time);
  let best = -1, bestDiff = Infinity;
  ALL_SLOTS.forEach((slot, i) => {
    const diff = Math.abs(timeToMinutes(slot) - mins);
    if (diff < bestDiff) { bestDiff = diff; best = i; }
  });
  return best;
}

/** Pick the best available slot for a task based on category preference */
function pickBestSlot(task, availableSlots) {
  const pref = CATEGORY_PREFERENCE[task.category] || CATEGORY_PREFERENCE.Other;
  const morningAvail = availableSlots.filter(s => s < MORNING_SLOTS.length);
  const afternoonAvail = availableSlots.filter(s => s >= MORNING_SLOTS.length);

  if (pref.prefer === 'morning' && morningAvail.length > 0) {
    return morningAvail[0]; // earliest morning slot
  }
  if (pref.prefer === 'afternoon' && afternoonAvail.length > 0) {
    return afternoonAvail[0]; // earliest afternoon slot
  }
  // Any preference or fallback: pick earliest available
  return availableSlots[0];
}

/**
 * Schedule tasks for a single project (high-level convenience).
 * Same as schedule() but always enables overflow and logs a summary.
 */
function scheduleProject(tasks) {
  const result = schedule(tasks, { maxPerDay: 7, overflowToNextDay: true });

  // Log distribution summary
  const byDate = {};
  result.forEach(t => {
    if (!byDate[t.date]) byDate[t.date] = [];
    byDate[t.date].push(t.time);
  });

  const dates = Object.keys(byDate).sort();
  console.log(`[Scheduler] ${result.length} tasks across ${dates.length} days:`);
  dates.forEach(d => {
    console.log(`  ${d}: ${byDate[d].sort().join(', ')}`);
  });

  return result;
}

module.exports = { schedule, scheduleProject, ALL_SLOTS, MORNING_SLOTS, AFTERNOON_SLOTS };
