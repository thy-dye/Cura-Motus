// Shared by Homepage (small streak indicator) and ProgressPage (full
// streak card) so the "what counts as an active day" logic only lives
// in one place.

export function dayKey(dateLike) {
  return new Date(dateLike).toDateString();
}

export function calculateStreak(completedDayKeys) {
  const today = new Date();
  const cursor = new Date(today);

  // If nothing's logged yet today, the streak isn't broken until today
  // actually ends, so start counting from yesterday instead.
  if (!completedDayKeys.has(dayKey(today))) {
    cursor.setDate(cursor.getDate() - 1);
  }

  let streak = 0;
  while (completedDayKeys.has(dayKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function startOfWeek(date) {
  const d = new Date(date);
  const mondayOffset = (d.getDay() + 6) % 7; // Sunday=0 -> 6, Monday=1 -> 0, ...
  d.setDate(d.getDate() - mondayOffset);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function getWeekDays() {
  const monday = startOfWeek(new Date());
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}
