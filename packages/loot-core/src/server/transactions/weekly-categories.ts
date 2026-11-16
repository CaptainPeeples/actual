// Custom branch: weekly categories (see #shared/weekly-categories).
//
// Whenever a transaction is saved in any category of a weekly set, it is
// moved to the week that matches its date. So picking any week of a set
// always lands the transaction in the right one.
import * as db from '#server/db';
import { parseWeekName, weekOfMonth } from '#shared/weekly-categories';
import type { TransactionEntity } from '#types/models';

type WeeklySets = Map<string, { set: string; byWeek: Map<number, string> }>;

export function buildWeeklySets(
  categories: Array<Pick<db.DbCategory, 'id' | 'name' | 'cat_group'>>,
): WeeklySets {
  const sets = new Map<string, Map<number, string>>();
  const result: WeeklySets = new Map();
  for (const cat of categories) {
    const parsed = parseWeekName(cat.name);
    if (!parsed) continue;
    const key = `${cat.cat_group}\n${parsed.prefix}`;
    const byWeek = sets.get(key) ?? new Map<number, string>();
    byWeek.set(parsed.week, cat.id);
    sets.set(key, byWeek);
    result.set(cat.id, { set: key, byWeek });
  }
  return result;
}

export function weeklyCategoryFor(
  sets: WeeklySets,
  category: string | null | undefined,
  date: string | null | undefined,
): string | null {
  if (!category || !date) return null;
  const entry = sets.get(category);
  if (!entry) return null;
  const target = entry.byWeek.get(weekOfMonth(date));
  return target && target !== category ? target : null;
}

async function loadWeeklySets(): Promise<WeeklySets> {
  const categories = await db.all<
    Pick<db.DbCategory, 'id' | 'name' | 'cat_group'>
  >('SELECT id, name, cat_group FROM categories WHERE tombstone = 0');
  return buildWeeklySets(categories);
}

// Fixes the category of added and updated transactions in place, before
// they are saved. `existing` holds the saved version of updated ones, so an
// edit that only changes the date (or only the category) still re-sorts.
export async function sortIntoWeeks(
  added: Array<Partial<TransactionEntity>> | undefined,
  updated: Array<Partial<TransactionEntity>> | undefined,
  getExisting: (ids: string[]) => Promise<TransactionEntity[]>,
) {
  const touchesCategoryOrDate = (t: Partial<TransactionEntity>) =>
    t.category !== undefined || t.date !== undefined;
  const updates = (updated ?? []).filter(touchesCategoryOrDate);
  if (!(added?.length ?? 0) && updates.length === 0) return;

  const sets = await loadWeeklySets();
  if (sets.size === 0) return;

  for (const t of added ?? []) {
    const target = weeklyCategoryFor(sets, t.category, t.date);
    if (target) t.category = target;
  }

  if (updates.length === 0) return;
  const saved = new Map(
    (await getExisting(updates.map(u => u.id))).map(t => [t.id, t]),
  );
  for (const t of updates) {
    const before = saved.get(t.id);
    const category = t.category !== undefined ? t.category : before?.category;
    const date = t.date ?? before?.date;
    const target = weeklyCategoryFor(sets, category, date);
    if (target) t.category = target;
  }
}
