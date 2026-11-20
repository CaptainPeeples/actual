import * as monthUtils from '@actual-app/core/shared/months';

import {
  currentMonthEnds,
  projectedFromParts,
  showsProjectedEndOfMonth,
} from './ProjectedEndOfMonth';

describe('projectedFromParts', () => {
  const thisMonth = {
    balance: 1_766_323,
    incomeLeft: 0,
    unpaid: 492_008,
    nextMonth: 1_370_000,
  };

  it('current month: balance + income left - unpaid - next month', () => {
    expect(projectedFromParts(thisMonth)).toBe(-95_685);
  });

  it('next month: where this month ends + its income - its bills - the month after', () => {
    const next = {
      ...thisMonth,
      following: { incomeLeft: 1_557_500, unpaid: 1_370_000 },
    };
    expect(currentMonthEnds(next)).toBe(1_274_315);
    expect(projectedFromParts(next)).toBe(
      1_274_315 + 1_557_500 - 1_370_000 - 1_370_000,
    );
  });

  it("doesn't jump on the 1st when the month goes to plan", () => {
    const before = {
      balance: 500_000,
      incomeLeft: 300_000,
      unpaid: 200_000,
      nextMonth: 900_000,
      following: { incomeLeft: 1_000_000, unpaid: 800_000 },
    };
    // On the 1st: this month's income came in and its bills got paid.
    const after = {
      balance: currentMonthEnds(before),
      incomeLeft: before.following.incomeLeft,
      unpaid: before.following.unpaid,
      nextMonth: before.nextMonth,
    };
    expect(projectedFromParts(after)).toBe(projectedFromParts(before));
  });
});

describe('showsProjectedEndOfMonth', () => {
  it('shows for this month and next month only', () => {
    const current = monthUtils.currentMonth();
    expect(showsProjectedEndOfMonth(current)).toBe(true);
    expect(showsProjectedEndOfMonth(monthUtils.addMonths(current, 1))).toBe(
      true,
    );
    expect(showsProjectedEndOfMonth(monthUtils.addMonths(current, 2))).toBe(
      false,
    );
    expect(showsProjectedEndOfMonth(monthUtils.subMonths(current, 1))).toBe(
      false,
    );
  });
});
