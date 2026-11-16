// Custom branch: weekly categories.
//
// A "weekly set" is a group of sibling categories named "<Name> Week 1"
// through "<Name> Week 4" (for example "Groceries Week 1" ... "Groceries
// Week 4"). Each week covers part of the month:
//
//   days 1-7 = Week 1, 8-14 = Week 2, 15-21 = Week 3, 22-end = Week 4
const WEEK_NAME = /^(.*\S)\s+Week\s+([1-4])$/i;

export function weekOfMonth(date: string): number {
  const day = parseInt(date.slice(8, 10), 10);
  return Math.min(4, Math.ceil(day / 7));
}

export function parseWeekName(
  name: string,
): { prefix: string; week: number } | null {
  const match = WEEK_NAME.exec(name.trim());
  return match
    ? { prefix: match[1].toLowerCase(), week: parseInt(match[2], 10) }
    : null;
}
