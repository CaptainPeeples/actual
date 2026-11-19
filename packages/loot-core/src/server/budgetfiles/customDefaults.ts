// Custom branch: starting setup for brand-new budget files.
//
// Stock Actual seeds a few placeholder categories and envelope budgeting.
// This branch instead starts every new budget in tracking mode with a full,
// generic category layout. No amounts are set. Existing budgets are never
// touched: this only runs from createBudget().
//
// Food and gas start as weekly categories ("Week 1 (1st-7th)" ...
// "Week 4 (22nd-End)"), so
// spending is sorted into the week it happened (see #shared/weekly-categories).
import * as db from '#server/db';
import { batchMessages } from '#server/sync';

const INCOME_GROUP_ID = '2E1F5BDB-209B-43F9-AF2C-3CE28E380C00';
const STOCK_INCOME_CATEGORY = 'Income';

export const DEFAULT_EXPENSE_GROUPS: ReadonlyArray<{
  name: string;
  categories: readonly string[];
}> = [
  { name: 'Housing', categories: ['Mortgage/Rent', 'Home Maintenance'] },
  {
    name: 'Bills & Utilities',
    categories: [
      'Phone',
      'Internet',
      'Water',
      'Natural Gas',
      'Electric',
      'Trash',
    ],
  },
  {
    name: 'Auto & Transport',
    categories: [
      'Auto Payment',
      'Auto Insurance',
      'Gas Week 1 (1st-7th)',
      'Gas Week 2 (8th-14th)',
      'Gas Week 3 (15th-21st)',
      'Gas Week 4 (22nd-End)',
      'Car Maintenance',
      'Parking & Tolls',
    ],
  },
  {
    name: 'Food, Dining & Coffee',
    categories: [
      'Week 1 (1st-7th)',
      'Week 2 (8th-14th)',
      'Week 3 (15th-21st)',
      'Week 4 (22nd-End)',
    ],
  },
  { name: 'Subscriptions', categories: ['Subscriptions'] },
  {
    name: 'Health & Wellness',
    categories: ['Medical', 'Dentist', 'Fitness', 'Personal Care'],
  },
  { name: 'Education', categories: ['Education'] },
  {
    name: 'Debt',
    categories: ['Credit Card Bill', 'Student Loans', 'Extra Debt Payment'],
  },
  { name: 'Savings', categories: ['Emergency Fund', 'Savings'] },
  {
    name: 'Travel & Lifestyle',
    categories: ['Travel', 'Entertainment', 'Hobbies', 'Pets'],
  },
  {
    name: 'Other Expenses',
    categories: [
      'Gifts',
      'Clothing',
      'Shopping',
      'Household Items',
      'Taxes',
      'Fees',
      'Cash & ATM',
      'Miscellaneous',
    ],
  },
];

// "Income 1" replaces the stock "Income" category; "Starting Balances" is
// kept as-is because account creation relies on it.
export const DEFAULT_EXTRA_INCOME_CATEGORIES: readonly string[] = [
  'Income 2',
  'Bonus Income',
  'Other Income',
  'Interest',
  'Refunds',
];

export async function seedCustomDefaults() {
  await batchMessages(async () => {
    const stockGroups = await db.all<db.DbCategoryGroup>(
      'SELECT * FROM category_groups WHERE is_income = 0 AND tombstone = 0',
    );
    for (const group of stockGroups) {
      await db.deleteCategoryGroup(group);
    }

    for (const group of DEFAULT_EXPENSE_GROUPS) {
      const groupId = await db.insertCategoryGroup({
        name: group.name,
        is_income: 0,
      });
      for (const name of group.categories) {
        await db.insertCategory(
          { name, cat_group: groupId, is_income: 0 },
          { atEnd: true },
        );
      }
    }

    const stockIncome = await db.first<db.DbCategory>(
      'SELECT * FROM categories WHERE cat_group = ? AND name = ? AND tombstone = 0',
      [INCOME_GROUP_ID, STOCK_INCOME_CATEGORY],
    );
    if (stockIncome) {
      await db.updateCategory({ ...stockIncome, name: 'Income 1' });
    }
    for (const name of DEFAULT_EXTRA_INCOME_CATEGORIES) {
      await db.insertCategory(
        { name, cat_group: INCOME_GROUP_ID, is_income: 1 },
        { atEnd: true },
      );
    }

    // Applying this preference through sync switches the open budget to
    // tracking mode (see the budgetType handling in sync/index.ts).
    await db.update('preferences', { id: 'budgetType', value: 'tracking' });
  });
}
