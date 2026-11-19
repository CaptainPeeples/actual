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

| Line                | How it's calculated                                                                                                                                                                                                                                                                                                                                                    |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Account balance     | Total of all open, on-budget accounts.                                                                                                                                                                                                                                                                                                                                 |
| Income still coming | For **each income category**: budgeted − received, never below 0. One category coming in over budget (or a negative line) can't cancel out paychecks you're still waiting on.                                                                                                                                                                                          |
| Bills not paid yet  | For **each expense category**: budgeted − spent, kept between 0 and the budgeted amount. A category that's paid, or overspent, counts as 0. Refunds can't make a category look like it owes more than it was budgeted. A weekly category whose week is already over counts as 0 (see section 7). A bill category whose schedules are all paid counts as 0 (see below). |
| Next month's bills  | Total budgeted expenses for next month.                                                                                                                                                                                                                                                                                                                                |

**Paid bills free up their leftover.** If a bill comes in under budget (say
water is budgeted at 150 and the bill is 100), the 50 left over counts as
money you keep, as soon as the bill is paid. A category counts as paid once
every schedule that belongs to it has a transaction linked to it this month.
A schedule belongs to a category when it was linked to a transaction there, or
its payee shows up there, in the last 3 months. If a bill is far off its usual
amount and the schedule doesn't match it, open the schedule and link the
transaction by hand. Categories with no schedules (groceries, gas) work the
same as before. The category's own Balance column still shows the leftover.

Hover over the number to see the breakdown. Past and future months still show
stock Actual's "Projected savings" / "Saved". The phone layout shows it too, in
the top-left of the budget page.

Code: `packages/desktop-client/src/components/budget/tracking/budgetsummary/ProjectedEndOfMonth.tsx`,
`packages/desktop-client/src/components/budget/paidBills.tsx`

### 4. Report cards can read tracking budgets

In stock Actual, `BUDGET_QUERY` in formula cards always reads envelope-budget
data, so income categories in a tracking budget read as 0. Formula cards now read
tracking-budget data when the budget is in tracking mode.

Code: `packages/desktop-client/src/hooks/useFormulaExecution.ts`

### 5. New budgets start set up

A **brand-new** budget file starts in **tracking** mode with a full, generic
category layout (no amounts):

- **Expense groups:** Housing, Bills & Utilities, Auto & Transport, Food,
  Dining & Coffee, Subscriptions, Health & Wellness, Education, Debt, Savings,
  Travel & Lifestyle, Other Expenses
- **Weekly categories:** Food, Dining & Coffee is split into Week 1 (1st-7th)
  … Week 4 (22nd-End), and Auto & Transport has Gas Week 1 (1st-7th) … Gas
  Week 4 (22nd-End) (see section 7)
- **Income:** Income 1, Income 2, Bonus Income, Other Income, Interest, Refunds,
  Starting Balances

Existing budgets are never changed. Edit the list in
`packages/loot-core/src/server/budgetfiles/customDefaults.ts`.

### 6. Phone layout tweaks

- The "You have N overspent categories" banner is hidden.
- Category groups start **collapsed**. Tap a group to open it; the phone
  remembers the ones you open.

Code: `packages/desktop-client/src/components/mobile/budget/`

### 7. Weekly categories

Split a spending category into weeks so you can see each week on its own.

**Set it up:** in one group, make 4 categories that end in `Week 1` to
`Week 4`. Either form works:

- `Week 1`, `Week 2`, `Week 3`, `Week 4` (the whole group is one weekly set)
- `Gas Week 1` … `Gas Week 4` (the name before "Week" makes its own set, so
  one group can hold more than one set)

A note in parentheses can go at the end, like `Week 1 (1st-7th)`. New budgets
start with the day ranges in the names.

Give each week its budget (for example, the monthly amount ÷ 4).

**The weeks:**

| Week   | Days of the month |
| ------ | ----------------- |
| Week 1 | 1–7               |
| Week 2 | 8–14              |
| Week 3 | 15–21             |
| Week 4 | 22–end            |

**What it does:**

- **Sorts by date.** Put a transaction in _any_ week of a set and it moves to
  the week that matches its date. This works for typing, editing, rules, and
  bank sync. So a rule can just say "Week 1" and the date picks the right
  week.
- **Group balance shows what you're really over.** A week with money left
  adds 0 to its group's balance. Only weeks that went over count. Money left
  in this week or a later week is already spoken for, so it can't hide
  overspending in an earlier week. Each week's own row still shows its real
  balance.

  ```
  group balance = budgeted − spent − money still left in weeks with money left
  ```

  Example: 4 weeks budgeted at 100 each. Week 1 spent 150, Week 2 spent 120,
  Week 3 spent 40 so far, Week 4 nothing yet. Stock Actual shows the group at
  +90. This branch shows **−70** (Week 1 is 50 over, Week 2 is 20 over).

- **Projected end of month** skips a week that is already over, since that
  money can't be spent anymore. Weeks still to come count as bills not paid
  yet.

Other categories work as usual. Renaming a category to or from `Week N` turns
it on or off.

Code: `packages/loot-core/src/shared/weekly-categories.ts`,
`packages/loot-core/src/server/transactions/weekly-categories.ts`,
`packages/loot-core/src/server/budget/tracking.ts` (`group-part-*` cells)

### 8. Green "+" for money in (transactions)

In transaction lists, any amount that is money coming in (income, refunds,
credits) shows in green with a `+` in front, like `+27.57`. That covers the
Deposit column on the computer and the amount on the phone, in every account
and every category's transaction list. The budget page is not changed: its
numbers stay the stock color (plus the red negative balances above).

This uses the new theme color `amountCredit` (the theme's normal green), set
in all three themes. Typing an amount works the same as before; the `+` is
only for display.

Code: `makeCreditStyle` and `withCreditSign` in
`packages/desktop-client/src/components/budget/util.ts`

### 9. ✓ on paid bills

On the budget page, a bill category gets a **✓** once its bills are paid for
that month (the same rule as "Paid bills free up their leftover" in section
3). A group gets a ✓ once every bill category in it is paid. Categories
without bills don't affect the group's ✓. On the computer the ✓ is in the
Spent column; on the phone it's after the name. The ✓ uses the normal text
color.

Code: `packages/desktop-client/src/components/budget/paidBills.tsx`

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
