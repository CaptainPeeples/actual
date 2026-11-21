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

**Bill categories hold only the bills still due.** A category with bills in
Schedules works like a paper budget with bills checked off: it holds only the
scheduled bills not paid yet this month, not its leftover budget. So a bill
that comes in under budget frees up the rest, and a surprise charge can't hide
a bill that's still coming. To tie a bill to its category, add a "set
category" action to the schedule's rule (Schedules → edit → the rule). A
schedule without one counts for the category it was linked to in the last 3
months. A bill is paid once a transaction is linked to it; if the amount is
far off and it doesn't match, open the schedule and link the transaction by
hand. An "is between" amount counts as the middle of the range. Categories
with no bills (groceries, gas) still use budgeted − spent.

**Next month shows it too**, one month ahead:

```
  where this month ends    (balance + income still coming - bills not paid yet)
+ next month's income
- next month's bills
- the month after's budgeted expenses
= projected end of next month
```

On the 1st, next month becomes the current month and the same math carries on
with real balances, so the number doesn't jump if the month went to plan.

Hover over the number to see the breakdown. Past months and months two or
more ahead still show stock Actual's "Projected savings" / "Saved". The phone layout shows it too, in
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
- **Checkmark:** a week that is over gets a ✓ in the check column (every
  week of a past month, none of a future month). It's only for looks: it
  doesn't change any balance, the group's ✓, or the projected end of month.

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

### 9. ✓ column, whole dollars, and short labels

The budget page has a narrow **✓ column** between the category names and the
Budget column, on the computer and the phone. A bill category gets a ✓ once
its bills due that month are paid (see "Bill categories hold only the bills
still due" in section 3), and a group gets a ✓ once every bill category in it
is paid. Categories without bills don't affect the group's ✓. The ✓ uses the
normal text color. On the phone the names column is 5% narrower to make room.

Group and category numbers (Budget, Spent, Balance) show **whole dollars with a
$ sign**, rounded to the nearest dollar (2,452.49 shows as $2,452; −2,452.49
shows as -$2,452). The **Projected** number (computer and phone) uses the same
format, so 810.16 shows as $810. This uses a new number format, `financial-dollars`; if a
currency is set in Settings, its own symbol is used instead of $. Typing a budget still
takes cents, and the totals at the top keep their cents.

Labels are shorter: **Budgeted** is now **Budget**, and **Projected end of
month** is now **Projected**.

Code: `packages/desktop-client/src/components/budget/paidBills.tsx`

### 10. Default budget

**Settings → Default budget** lists every group and category like the budget
page, with a default amount for each. Click an amount to change it. Group and
section totals update as you go.

- **Every month after the current one follows the defaults.** Changing a
  default updates that category in all later months at once. The current
  month and past months only change when you change them.
- The first time the page opens, the defaults start from next month's budget,
  and every later month is set to match.
- **New months** added to the end of the budget start with the defaults.
- **Changing a budget amount** on the budget page (desktop or phone) asks:
  _Only this month_ or _Change the default_. It only asks once defaults are
  set up, and only when the new amount differs from both the old amount and
  the default. Closing the pop-up counts as _Only this month_.
- An _Only this month_ change in a future month is kept: later default changes
  skip that category in that month.
- **Copy default budget** in a month's menu sets the whole month to the
  defaults and clears its _Only this month_ changes.

The defaults are saved as synced preferences (`defaultBudget`,
`defaultBudgetOneOff`), so they follow the budget file to every device.

Code: `packages/loot-core/src/server/budget/default-budget.ts`,
`packages/desktop-client/src/components/settings/DefaultBudget.tsx`,
`packages/desktop-client/src/components/modals/DefaultBudgetChoiceModal.tsx`

### 11. Income page

A new **Income** page (left menu under Budget; a tab on the phone) works out
each paycheck for a month: gross pay, pre-tax deductions, each tax, after-tax
deductions, and **net pay**. It also shows the month's take-home and the
year's totals.

**Settings** (all new, under Settings):

- **Income:** pay schedule (weekly, every 2 weeks, twice a month, monthly),
  paydays, hourly rate (with raises by date), hour lines (hours, × rate for
  overtime, which check), taxed-but-not-paid amounts, other monthly income.
- **Taxes:** filing status, W-4 (2020+ Steps 2–4, or older allowances), ZIP →
  state, state allowances and extra, city/county %, other employee taxes with
  an optional yearly wage cap.
- **Deductions:** pre-tax (401(k)/403(b) lowers income tax only; medical,
  dental, vision, HSA lower Social Security and Medicare too) and after-tax.
  Each is $ or % of hourly pay (rounded up to the cent), on every check or one.

**How taxes are figured** (each check, like payroll):

- Federal: IRS Pub 15-T annual percentage method. Extra pay is withheld at
  the 22% supplemental rate.
- Social Security stops at the yearly wage base; Medicare adds 0.9% past
  $200,000. Both use year-to-date pay from the year's checks in date order, so
  they start over with the first check of each year.
- State: a table for all 50 states + DC. Entries marked `estimate` are close
  but skip some state-specific steps.

**Top bar** (under the month): the hourly rate, per diem rate, and an hours
box for each pay line on each check it's on (built from Settings → Income).
Each month keeps its own hours; untouched months use the Settings hours. A
rate typed in a month carries forward to later months. Go back a month to see
or fix past months; those hours feed the year-to-date totals, so Social
Security stops on the right check.

**Bonus** box on each check: withheld at the 22% supplemental rate.

**Per diem** (Settings → Income): rate, starting hours, which check, and
whether it's taxed. Untaxed per diem is added to net pay after taxes.

**Planned income** (tracking budgets): each check's net pay is split by pay
line (first line = the net of a check with only that line; each later line =
what it adds; then per diem, then bonus). Pick an income category for each
and press "Add to <Month>'s budget". It sets that month's budget for those
categories only (as an "Only this month" change), and Undo takes it back.

Settings are saved as synced preferences (`income-settings`, `income-taxes`,
`income-deductions`, `income-history`). Nothing else in the budget changes.

**Each new year:** add a tax file (for example `federal-2027.ts` and
`states-2027.ts`) and list it in `TAX_YEARS` in `paycheck.ts`. Until then the
newest tables are used and Settings → Taxes shows a note.

Code: `packages/loot-core/src/shared/paycheck/`,
`packages/desktop-client/src/components/income/`,
`packages/desktop-client/src/components/settings/IncomeSettings.tsx`,
`TaxSettings.tsx`, `DeductionSettings.tsx`

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
