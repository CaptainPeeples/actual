# Peeples branch

This is a fork of [Actual Budget](https://github.com/actualbudget/actual), based on
**v26.11.0**. The `peeples` branch adds the changes below. Everything else works the
same as stock Actual.

## What's different

### 1. Hunter green theme

The dark theme's purple accents are now hunter green. That covers sidebar
highlights, buttons, links, the month picker, checkboxes, and pills. The
browser's tab and toolbar color (`theme-color`) is dark hunter green
(`#1c3a23`) too.

- Palette: `--palette-hunter100` … `--palette-hunter900` in
  `packages/component-library/src/themes/dark.css`
- Light and midnight themes are unchanged.

### 2. Pure red negative balances

On the budget page:

- **Categories** show their balance in pure red (`#ff0000`) when it's negative.
- **Groups** show their balance in pure red only when the group's total
  balance is negative.
- Works on both the computer and phone layouts.

This uses the new theme color `budgetBalanceNegative`, which is set in all three
themes. Other negative numbers in the app keep their stock color.

### 3. "Projected end of month" (tracking budgets)

For the **current month** of a tracking budget, the "Projected savings" box at
the top of the budget page is replaced with **Projected end of month**. It works
like a cash-flow spreadsheet: _what will my accounts hold once this month's bills
are paid and next month's bills are set aside?_

```
  on-budget account balance
+ income still coming this month
- bills not paid yet this month
- next month's budgeted expenses
= projected end of month
```

How each line is figured:

| Line                | How it's calculated                                                                                                                                                                                                    |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Account balance     | Total of all open, on-budget accounts.                                                                                                                                                                                 |
| Income still coming | For **each income category**: budgeted − received, never below 0. One category coming in over budget (or a negative line) can't cancel out paychecks you're still waiting on.                                          |
| Bills not paid yet  | For **each expense category**: budgeted − spent, kept between 0 and the budgeted amount. A category that's paid, or overspent, counts as 0. Refunds can't make a category look like it owes more than it was budgeted. |
| Next month's bills  | Total budgeted expenses for next month.                                                                                                                                                                                |

Hover over the number to see the breakdown. Past and future months still show
stock Actual's "Projected savings" / "Saved". The phone layout shows it too, in
the top-left of the budget page.

Code: `packages/desktop-client/src/components/budget/tracking/budgetsummary/ProjectedEndOfMonth.tsx`

### 4. Report cards can read tracking budgets

In stock Actual, `BUDGET_QUERY` in formula cards always reads envelope-budget
data, so income categories in a tracking budget read as 0. Formula cards now read
tracking-budget data when the budget is in tracking mode.

Code: `packages/desktop-client/src/hooks/useFormulaExecution.ts`

### 5. New budgets start set up

A **brand-new** budget file starts in **tracking** mode with a full, generic
category layout (no amounts):

- **Expense groups:** Housing, Bills & Utilities, Auto & Transport, Food &
  Dining, Subscriptions, Health & Wellness, Education, Debt, Savings, Travel &
  Lifestyle, Other Expenses
- **Income:** Income 1, Income 2, Bonus Income, Other Income, Interest, Refunds,
  Starting Balances

Existing budgets are never changed. Edit the list in
`packages/loot-core/src/server/budgetfiles/customDefaults.ts`.

### 6. Phone layout tweaks

- The "You have N overspent categories" banner is hidden.
- Category groups start **collapsed**. Tap a group to open it; the phone
  remembers the ones you open.

Code: `packages/desktop-client/src/components/mobile/budget/`

## Docker image

Every push to `peeples` builds and publishes an image with GitHub Actions
(`.github/workflows/peeples-docker.yml`):

```
ghcr.io/captainpeeples/actual:latest
```

Use it in place of `actualbudget/actual-server` in your compose file. Your data
folder stays the same, so there's nothing to migrate.

## Pulling in new Actual releases

Merge the new release tag into `peeples`, fix any conflicts (most likely in
`dark.css`), and push. GitHub builds the new image.
