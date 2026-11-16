import { beforeEach, describe, expect, it } from 'vitest';

import * as db from '#server/db';
import { parseWeekName, weekOfMonth } from '#shared/weekly-categories';

import { batchUpdateTransactions } from './index';

beforeEach(global.emptyDatabase());

async function setup() {
  await db.insertAccount({ id: 'acct', name: 'Checking' });
  const group = await db.insertCategoryGroup({ name: 'Food', is_income: 0 });
  for (const week of [1, 2, 3, 4]) {
    await db.insertCategory({
      id: `food-${week}`,
      name: `Food Week ${week}`,
      cat_group: group,
      is_income: 0,
    });
  }
  await db.insertCategory({
    id: 'other',
    name: 'Other',
    cat_group: group,
    is_income: 0,
  });
}

async function categoryOf(id: string) {
  const row = await db.first<{ category: string }>(
    'SELECT category FROM v_transactions_internal WHERE id = ?',
    [id],
  );
  return row?.category;
}

describe('weekly categories', () => {
  it('splits the month into four weeks', () => {
    expect(weekOfMonth('2026-11-01')).toBe(1);
    expect(weekOfMonth('2026-11-07')).toBe(1);
    expect(weekOfMonth('2026-11-08')).toBe(2);
    expect(weekOfMonth('2026-11-15')).toBe(3);
    expect(weekOfMonth('2026-11-21')).toBe(3);
    expect(weekOfMonth('2026-11-22')).toBe(4);
    expect(weekOfMonth('2026-12-31')).toBe(4);
  });

  it('reads week names', () => {
    expect(parseWeekName('Food & Dining Week 3')).toEqual({
      prefix: 'food & dining',
      week: 3,
    });
    expect(parseWeekName('Food & Dining')).toBeNull();
    expect(parseWeekName('Week 2')).toEqual({ prefix: '', week: 2 });
    expect(parseWeekName('Gas Week 5')).toBeNull();
  });

  it('moves an added transaction to the week of its date', async () => {
    await setup();
    await batchUpdateTransactions({
      added: [
        {
          id: 't1',
          account: 'acct',
          amount: -100,
          date: '2026-11-20',
          category: 'food-1',
        },
      ],
    });
    expect(await categoryOf('t1')).toBe('food-3');
  });

  it('re-sorts when only the category or only the date changes', async () => {
    await setup();
    await db.insertTransaction({
      id: 't1',
      account: 'acct',
      amount: -100,
      date: '2026-11-25',
      category: 'other',
    });

    await batchUpdateTransactions({
      updated: [{ id: 't1', category: 'food-1' }],
    });
    expect(await categoryOf('t1')).toBe('food-4');

    await batchUpdateTransactions({
      updated: [{ id: 't1', date: '2026-11-09' }],
    });
    expect(await categoryOf('t1')).toBe('food-2');
  });

  it('leaves other categories alone', async () => {
    await setup();
    await batchUpdateTransactions({
      added: [
        {
          id: 't1',
          account: 'acct',
          amount: -100,
          date: '2026-11-20',
          category: 'other',
        },
      ],
    });
    expect(await categoryOf('t1')).toBe('other');
  });
});
