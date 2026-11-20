// Custom branch: default budget.
//
// Each category can have a default budget amount (Settings → Default budget).
// Every month after the current one follows the defaults:
//
// - Changing a default updates that category in every later month at once.
// - A month you change with "Only this month" keeps its own amount; later
//   default changes skip that category in that month.
// - New months added to the end of the budget start with the defaults.
// - "Copy default budget" in a month's menu sets the whole month to the
//   defaults (and clears its "only this month" amounts).
//
// The current month and past months only change when you change them.
//
// Both lists are stored as synced preferences so they follow the budget
// file to every device.
import * as db from '#server/db';
import * as sheet from '#server/sheet';
import { batchMessages } from '#server/sync';
import * as monthUtils from '#shared/months';

import { getBudget, isTrackingBudget, setBudget } from './actions';

export const DEFAULT_BUDGET_PREF = 'defaultBudget';
export const DEFAULT_BUDGET_ONE_OFF_PREF = 'defaultBudgetOneOff';

// Category id → default amount.
export type DefaultAmounts = Record<string, number>;
// Month ("YYYY-MM") → ids of categories changed for that month only.
type OneOffs = Record<string, string[]>;

export type DefaultBudget = {
  enabled: boolean;
  amounts: DefaultAmounts;
};

function readPref<T>(id: string): T | null {
  const row = db.firstSync<Pick<db.DbPreference, 'value'>>(
    'SELECT value FROM preferences WHERE id = ?',
    [id],
  );
  if (!row?.value) {
    return null;
  }
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return null;
  }
}

async function writePref(id: string, value: unknown) {
  await db.update('preferences', { id, value: JSON.stringify(value) });
}

function readAmounts(): DefaultAmounts | null {
  return readPref<DefaultAmounts>(DEFAULT_BUDGET_PREF);
}

function readOneOffs(): OneOffs {
  return readPref<OneOffs>(DEFAULT_BUDGET_ONE_OFF_PREF) ?? {};
}

// Drop months that are no longer in the future; they can't change anymore.
async function writeOneOffs(oneOffs: OneOffs) {
  const current = monthUtils.currentMonth();
  const kept: OneOffs = {};
  for (const [month, ids] of Object.entries(oneOffs)) {
    if (month > current && ids.length > 0) {
      kept[month] = ids;
    }
  }
  await writePref(DEFAULT_BUDGET_ONE_OFF_PREF, kept);
}

// Every month after the current one that the budget has set up.
function futureMonths(): string[] {
  const { createdMonths } = sheet.get().meta();
  let latest: string | null = null;
  for (const month of createdMonths ?? []) {
    if (latest == null || month > latest) {
      latest = month;
    }
  }
  const first = monthUtils.nextMonth(monthUtils.currentMonth());
  if (latest == null || latest < first) {
    return [];
  }
  return monthUtils.rangeInclusive(first, latest);
}

type CategoryRow = { id: string; is_income: number; hidden: number };

function budgetableCategories(): CategoryRow[] {
  const rows = db.runQuery<CategoryRow>(
    `SELECT c.id, c.is_income, c.hidden FROM categories c
     LEFT JOIN category_groups g ON c.cat_group = g.id
     WHERE c.tombstone = 0 AND (g.hidden IS NULL OR g.hidden = 0)`,
    [],
    true,
  );
  const tracking = isTrackingBudget();
  return rows.filter(c => tracking || c.is_income !== 1);
}

// The defaults, if they've been set up. Read-only.
export async function getDefaultBudget(): Promise<DefaultBudget> {
  const amounts = readAmounts();
  return { enabled: amounts != null, amounts: amounts ?? {} };
}

// Used before saving a budget edit: is there a default to ask about?
export async function getDefaultBudgetForEdit({
  month,
  category,
}: {
  month: string;
  category: string;
}): Promise<{
  enabled: boolean;
  defaultAmount: number | null;
  current: number;
}> {
  const amounts = readAmounts();
  return {
    enabled: amounts != null,
    defaultAmount: amounts?.[category] ?? null,
    current: getBudget({ month, category }),
  };
}

// The first time the Default budget page opens, start the defaults from
// next month's budget and make every later month match them.
export async function setUpDefaultBudget(): Promise<DefaultBudget> {
  const existing = readAmounts();
  if (existing) {
    return { enabled: true, amounts: existing };
  }
  const next = monthUtils.nextMonth(monthUtils.currentMonth());
  const amounts: DefaultAmounts = {};
  for (const cat of budgetableCategories()) {
    if (cat.hidden !== 1) {
      amounts[cat.id] = getBudget({ month: next, category: cat.id });
    }
  }
  await batchMessages(async () => {
    await writePref(DEFAULT_BUDGET_PREF, amounts);
    await writeOneOffs({});
    for (const month of futureMonths()) {
      for (const [category, amount] of Object.entries(amounts)) {
        void setBudget({ category, month, amount });
      }
    }
  });
  return { enabled: true, amounts };
}

// Change one category's default, and every later month with it. If `month`
// is given (a change made on the budget page), that month gets the new
// amount too.
export async function setDefaultBudgetAmount({
  category,
  amount,
  month,
}: {
  category: string;
  amount: number;
  month?: string;
}): Promise<void> {
  const amounts = { ...(readAmounts() ?? {}), [category]: amount };
  const oneOffs = readOneOffs();
  if (month && oneOffs[month]) {
    oneOffs[month] = oneOffs[month].filter(id => id !== category);
  }
  await batchMessages(async () => {
    await writePref(DEFAULT_BUDGET_PREF, amounts);
    await writeOneOffs(oneOffs);
    if (month) {
      void setBudget({ category, month, amount });
    }
    for (const future of futureMonths()) {
      if (future !== month && !oneOffs[future]?.includes(category)) {
        void setBudget({ category, month: future, amount });
      }
    }
  });
}

// Change one month only. In a future month, later default changes will
// leave this amount alone.
export async function setBudgetOnlyThisMonth({
  category,
  amount,
  month,
}: {
  category: string;
  amount: number;
  month: string;
}): Promise<void> {
  const oneOffs = readOneOffs();
  if (month > monthUtils.currentMonth()) {
    const ids = oneOffs[month] ?? [];
    if (!ids.includes(category)) {
      oneOffs[month] = [...ids, category];
    }
  }
  await batchMessages(async () => {
    void setBudget({ category, month, amount });
    if (readAmounts() != null) {
      await writeOneOffs(oneOffs);
    }
  });
}

// Month menu → "Copy default budget".
export async function copyDefaultBudget({
  month,
}: {
  month: string;
}): Promise<void> {
  const amounts = readAmounts() ?? {};
  const oneOffs = readOneOffs();
  delete oneOffs[month];
  const ids = new Set(budgetableCategories().map(c => c.id));
  await batchMessages(async () => {
    for (const [category, amount] of Object.entries(amounts)) {
      if (ids.has(category)) {
        void setBudget({ category, month, amount });
      }
    }
    if (readAmounts() != null) {
      await writeOneOffs(oneOffs);
    }
  });
}

// New months at the end of the budget start with the defaults. Only fills
// categories that have nothing saved for that month yet.
export async function fillNewMonthsWithDefaults(
  months: string[],
): Promise<void> {
  const amounts = readAmounts();
  if (!amounts) {
    return;
  }
  const current = monthUtils.currentMonth();
  const table = isTrackingBudget() ? 'reflect_budgets' : 'zero_budgets';
  const ids = new Set(budgetableCategories().map(c => c.id));
  const toSet: Array<{ category: string; month: string; amount: number }> = [];
  for (const month of months) {
    if (month <= current) {
      continue;
    }
    const saved = new Set(
      db
        .runQuery<{
          category: string;
        }>(
          `SELECT category FROM ${table} WHERE month = ?`,
          [parseInt(month.replace('-', ''))],
          true,
        )
        .map(r => r.category),
    );
    for (const [category, amount] of Object.entries(amounts)) {
      if (ids.has(category) && !saved.has(category)) {
        toSet.push({ category, month, amount });
      }
    }
  }
  if (toSet.length === 0) {
    return;
  }
  await batchMessages(async () => {
    for (const row of toSet) {
      void setBudget(row);
    }
  });
}
