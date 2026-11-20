// @ts-strict-ignore
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import * as db from '#server/db';
import * as sheet from '#server/sheet';

import { getSheetValue, setBudget } from './actions';
import * as budget from './base';
import {
  copyDefaultBudget,
  fillNewMonthsWithDefaults,
  getDefaultBudget,
  getDefaultBudgetForEdit,
  setBudgetOnlyThisMonth,
  setDefaultBudgetAmount,
  setUpDefaultBudget,
} from './default-budget';

const MONTHS = ['2024-01', '2024-02', '2024-03', '2024-04'];

async function value(month: string, category: string) {
  await sheet.waitOnSpreadsheet();
  return getSheetValue('budget' + month.replace('-', ''), 'budget-' + category);
}

describe('default budget', () => {
  let savedMonth: string;

  beforeEach(async () => {
    await global.emptyDatabase()();
    savedMonth = global.currentMonth;
    global.currentMonth = '2024-01';
    db.runQuery(
      `INSERT INTO preferences (id, value) VALUES ('budgetType', 'tracking')`,
    );
    await db.insertCategoryGroup({ id: 'g', name: 'Bills', is_income: 0 });
    await db.insertCategory({ id: 'cc', name: 'Card', cat_group: 'g' });
    await db.insertCategory({ id: 'food', name: 'Food', cat_group: 'g' });
    await db.insertCategoryGroup({ id: 'ig', name: 'Income', is_income: 1 });
    await db.insertCategory({
      id: 'pay',
      name: 'Pay',
      cat_group: 'ig',
      is_income: 1,
    });
    await sheet.loadSpreadsheet(db);
    await budget.createBudget(MONTHS);
    for (const month of MONTHS) {
      await setBudget({ category: 'cc', month, amount: 80000 });
      await setBudget({ category: 'food', month, amount: 50000 });
      await setBudget({ category: 'pay', month, amount: 300000 });
    }
    await setBudget({ category: 'cc', month: '2024-04', amount: 70000 });
  });

  afterEach(async () => {
    global.currentMonth = savedMonth;
    await global.emptyDatabase()();
  });

  it('is off until it is set up', async () => {
    expect(await getDefaultBudget()).toEqual({ enabled: false, amounts: {} });
    const edit = await getDefaultBudgetForEdit({
      month: '2024-01',
      category: 'cc',
    });
    expect(edit).toEqual({
      enabled: false,
      defaultAmount: null,
      current: 80000,
    });
  });

  it('starts from next month and makes later months match', async () => {
    const result = await setUpDefaultBudget();
    expect(result.amounts).toEqual({ cc: 80000, food: 50000, pay: 300000 });
    expect(await value('2024-04', 'cc')).toBe(80000);
    // Running it again keeps what's there.
    await setDefaultBudgetAmount({ category: 'cc', amount: 90000 });
    expect((await setUpDefaultBudget()).amounts.cc).toBe(90000);
  });

  it('updates every later month, but not this month or past months', async () => {
    await setUpDefaultBudget();
    await setDefaultBudgetAmount({ category: 'cc', amount: 90000 });
    expect(await value('2024-01', 'cc')).toBe(80000);
    expect(await value('2024-02', 'cc')).toBe(90000);
    expect(await value('2024-04', 'cc')).toBe(90000);
    expect(await value('2024-02', 'food')).toBe(50000);
  });

  it('changes the edited month too when one is given', async () => {
    await setUpDefaultBudget();
    await setDefaultBudgetAmount({
      category: 'cc',
      amount: 90000,
      month: '2024-01',
    });
    expect(await value('2024-01', 'cc')).toBe(90000);
    expect(await value('2024-03', 'cc')).toBe(90000);
  });

  it('leaves "only this month" changes alone', async () => {
    await setUpDefaultBudget();
    await setBudgetOnlyThisMonth({
      category: 'cc',
      amount: 120000,
      month: '2024-03',
    });
    await setDefaultBudgetAmount({ category: 'cc', amount: 90000 });
    expect(await value('2024-02', 'cc')).toBe(90000);
    expect(await value('2024-03', 'cc')).toBe(120000);
    expect(await value('2024-04', 'cc')).toBe(90000);
  });

  it('copies the defaults into a month and clears its one-off changes', async () => {
    await setUpDefaultBudget();
    await setBudgetOnlyThisMonth({
      category: 'cc',
      amount: 120000,
      month: '2024-03',
    });
    await setBudget({ category: 'food', month: '2024-01', amount: 1 });
    await copyDefaultBudget({ month: '2024-01' });
    expect(await value('2024-01', 'food')).toBe(50000);

    await copyDefaultBudget({ month: '2024-03' });
    expect(await value('2024-03', 'cc')).toBe(80000);
    await setDefaultBudgetAmount({ category: 'cc', amount: 90000 });
    expect(await value('2024-03', 'cc')).toBe(90000);
  });

  it('fills new months that have nothing saved yet', async () => {
    await setUpDefaultBudget();
    await setDefaultBudgetAmount({ category: 'food', amount: 60000 });
    await budget.createBudget(['2024-05']);
    await fillNewMonthsWithDefaults(['2024-01', '2024-05']);
    expect(await value('2024-05', 'food')).toBe(60000);
    expect(await value('2024-05', 'pay')).toBe(300000);
    // The current month is never filled.
    expect(await value('2024-01', 'food')).toBe(50000);
  });

  it('does nothing to new months when it is not set up', async () => {
    await budget.createBudget(['2024-05']);
    await fillNewMonthsWithDefaults(['2024-05']);
    expect(await value('2024-05', 'food')).toBe(0);
  });
});
