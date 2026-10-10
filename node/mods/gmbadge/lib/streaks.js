'use strict';

//
// Pure streak logic. No Saito dependencies so it can run on the node,
// in the browser bundle, and under `node --test`.
//
// A "day" is a UTC day index: Math.floor(unix_ms / 86400000).
//

const DAY_MS = 86400000;

const TIERS = [
  { id: 0, name: 'none', label: 'No streak', min: 0 },
  { id: 1, name: 'sprout', label: 'Sprout', min: 1 },
  { id: 2, name: 'green', label: 'Green Check', min: 7 },
  { id: 3, name: 'gold', label: 'Gold Ring', min: 30 },
  { id: 4, name: 'diamond', label: 'Diamond', min: 100 },
  { id: 5, name: 'flame', label: 'Flame', min: 365 }
];

const MILESTONES = [7, 30, 100, 365];

//
// "gm", "GM", "gm fam", "gm ☀️", "☀️ gm", "gm!" all count.
// "gmgm", "good morning", "omg" do not.
//
function isGm(text) {
  if (typeof text !== 'string') {
    return false;
  }
  const stripped = text.replace(/^[^\p{L}\p{N}]+/u, '');
  return /^gm(?![\p{L}\p{N}])/iu.test(stripped);
}

function dayIndex(timestampMs) {
  return Math.floor(Number(timestampMs) / DAY_MS);
}

function dayString(index) {
  if (index == null) {
    return null;
  }
  return new Date(Number(index) * DAY_MS).toISOString().slice(0, 10);
}

function tierFor(streak) {
  let found = TIERS[0];
  for (const tier of TIERS) {
    if (tier.min > 0 && streak >= tier.min) {
      found = tier;
    }
  }
  return found;
}

function nextMilestone(streak) {
  for (const m of MILESTONES) {
    if (m > streak) {
      return m;
    }
  }
  return null;
}

function emptyState(publickey = '') {
  return {
    publickey,
    serial: null,
    current: 0,
    longest: 0,
    lifetime: 0,
    first_day: null,
    last_day: null
  };
}

//
// Apply one confirmed gm on `day` to a stored state.
// Days must arrive in non-decreasing order (blocks are processed in order).
// A second gm on the same day, or a day older than the last one, is ignored.
//
function applyGm(previous, day) {
  const state = Object.assign(emptyState(), previous || {});
  const result = { state, duplicate: false, first: false, broke: false, milestone: null };
  day = Number(day);

  if (state.last_day != null && day <= Number(state.last_day)) {
    result.duplicate = true;
    return result;
  }

  if (!state.lifetime || state.first_day == null) {
    result.first = true;
    state.first_day = day;
  }

  if (state.last_day != null && day === Number(state.last_day) + 1) {
    state.current = Number(state.current) + 1;
  } else {
    if (state.last_day != null) {
      result.broke = true;
    }
    state.current = 1;
  }

  state.lifetime = Number(state.lifetime) + 1;
  state.last_day = day;
  if (state.current > Number(state.longest)) {
    state.longest = state.current;
  }
  if (MILESTONES.includes(state.current)) {
    result.milestone = state.current;
  }
  return result;
}

//
// What the badge looks like *today*. A streak is alive if the holder
// posted today or yesterday. One missed day shows a cracked badge for
// 24 hours; after that the badge goes dormant until the next gm.
//
function view(state, today) {
  const s = Object.assign(emptyState(), state || {});
  today = Number(today);
  const gap = s.last_day == null ? null : today - Number(s.last_day);
  const alive = gap != null && gap <= 1;
  const streak = alive ? Number(s.current) : 0;
  const tier = tierFor(streak);
  const cracked = gap === 2 && Number(s.lifetime) > 0;
  const dormant = gap != null && gap > 2;
  const next = nextMilestone(streak);

  return {
    publickey: s.publickey,
    serial: s.serial,
    streak,
    tier,
    cracked,
    dormant,
    posted_today: gap === 0,
    at_risk: gap === 1,
    lifetime: Number(s.lifetime),
    longest: Number(s.longest),
    lost_streak: cracked || dormant ? Number(s.current) : 0,
    first_day: s.first_day,
    first_date: dayString(s.first_day),
    last_day: s.last_day,
    last_date: dayString(s.last_day),
    next_milestone: next,
    days_to_next: next ? next - streak : 0
  };
}

module.exports = {
  DAY_MS,
  TIERS,
  MILESTONES,
  isGm,
  dayIndex,
  dayString,
  tierFor,
  nextMilestone,
  emptyState,
  applyGm,
  view
};
