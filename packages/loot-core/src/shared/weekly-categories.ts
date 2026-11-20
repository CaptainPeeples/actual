// Custom branch: weekly categories.
//
// A "weekly set" is a group of sibling categories named "<Name> Week 1"
// through "<Name> Week 4" (for example "Groceries Week 1" ... "Groceries
// Week 4"). The name can be left off ("Week 1" ... "Week 4"); the set is
// then every plain week in that group. A note in parentheses may follow
// ("Week 1 (1st-7th)"). Each week covers part of the month:
//
//   days 1-7 = Week 1, 8-14 = Week 2, 15-21 = Week 3, 22-end = Week 4
const WEEK_NAME = /^(?:(.*\S)\s+)?Week\s+([1-4])(?:\s*\([^()]*\))?$/i;

export function weekOfMonth(date: string): number {
  const day = parseInt(date.slice(8, 10), 10);
  return Math.min(4, Math.ceil(day / 7));
}

export function parseWeekName(
  name: string,
): { prefix: string; week: number } | null {
  const match = WEEK_NAME.exec(name.trim());
  return match
    ? { prefix: (match[1] ?? '').toLowerCase(), week: parseInt(match[2], 10) }
    : null;
}

// True when `name` is a weekly category whose week of `month` ("YYYY-MM") has
// already ended as of `today` ("YYYY-MM-DD"). Every week of a past month is
// over; no week of a future month is.
export function weekIsOver(name: string, month: string, today: string) {
  const parsed = parseWeekName(name);
  if (!parsed) return false;
  const current = today.slice(0, 7);
  if (month !== current) return month < current;
  return weekOfMonth(today) > parsed.week;
}
