// Custom branch: bills paid through schedules.
//
// A category's bill is paid for a month once every schedule that belongs to
// it has a transaction linked to it that month (in any category, since one
// payee can bill more than one category). A schedule belongs to a category
// when it was linked to a transaction in that category, or its payee shows
// up there, that month or in the 3 months before.
//
// The projected end of month uses this to free up what a paid bill didn't
// use, and the budget page shows a ✓ on paid bills and on groups whose
// bills are all paid.
import React, { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';

import * as monthUtils from '@actual-app/core/shared/months';
import { q } from '@actual-app/core/shared/query';

import { useQuery } from '#hooks/useQuery';

import { MonthsContext } from './MonthsContext';

const LOOKBACK_MONTHS = 3;

export type LinkedTransaction = {
  date: string;
  category: string | null;
  payee: string | null;
  schedule: string | null;
};

export type OpenSchedule = {
  id: string;
  next_date: string | null;
  _payee: string | null;
};

export type BillStatus = {
  // Categories whose bills are all paid this month.
  paid: Set<string>;
  // Categories that have a bill this month, paid or not.
  hasBills: Set<string>;
};

export function billStatus(
  transactions: LinkedTransaction[],
  schedules: OpenSchedule[],
  month: string,
): BillStatus {
  const monthStart = monthUtils.firstDayOfMonth(
    monthUtils.subMonths(month, LOOKBACK_MONTHS),
  );
  const monthEnd = monthUtils.lastDayOfMonth(month);
  const linkedThisMonth = new Set<string>();
  const paidThisMonth = new Set<string>();
  const belongs = new Map<string, Set<string>>();
  const byPayee = new Map<string, string[]>();
  for (const s of schedules) {
    if (!s._payee) continue;
    byPayee.set(s._payee, [...(byPayee.get(s._payee) ?? []), s.id]);
  }
  const add = (category: string, id: string) => {
    const set = belongs.get(category) ?? new Set<string>();
    set.add(id);
    belongs.set(category, set);
  };
  for (const t of transactions) {
    if (!t.category || t.date < monthStart || t.date > monthEnd) continue;
    if (t.schedule) {
      add(t.category, t.schedule);
      if (monthUtils.monthFromDate(t.date) === month) {
        linkedThisMonth.add(t.category);
        paidThisMonth.add(t.schedule);
      }
    }
    for (const id of (t.payee && byPayee.get(t.payee)) || []) {
      add(t.category, id);
    }
  }
  const dueByMonthEnd = new Set(
    schedules
      .filter(s => s.next_date && s.next_date <= monthEnd)
      .map(s => s.id),
  );
  const paid = new Set<string>();
  const hasBills = new Set<string>();
  for (const [category, ids] of belongs) {
    const thisMonth = [...ids].filter(
      id => dueByMonthEnd.has(id) || paidThisMonth.has(id),
    );
    if (thisMonth.length === 0) continue;
    hasBills.add(category);
    if (
      linkedThisMonth.has(category) &&
      thisMonth.every(id => paidThisMonth.has(id))
    ) {
      paid.add(category);
    }
  }
  return { paid, hasBills };
}

export function paidBillCategories(
  transactions: LinkedTransaction[],
  schedules: OpenSchedule[],
  month: string,
): Set<string> {
  return billStatus(transactions, schedules, month).paid;
}

// True when a group has at least one bill and all of them are paid.
export function groupBillsPaid(
  status: BillStatus | null,
  categoryIds: string[],
): boolean {
  if (!status) return false;
  const bills = categoryIds.filter(id => status.hasBills.has(id));
  return bills.length > 0 && bills.every(id => status.paid.has(id));
}

// Live, so linking a bill to its schedule shows up at once.
export function useBillData(firstMonth: string, lastMonth: string) {
  const { data: transactions } = useQuery<LinkedTransaction>(
    () =>
      q('transactions')
        .filter({
          date: {
            $gte: monthUtils.firstDayOfMonth(
              monthUtils.subMonths(firstMonth, LOOKBACK_MONTHS),
            ),
            $lte: monthUtils.lastDayOfMonth(lastMonth),
          },
        })
        .select(['date', 'category', 'payee', 'schedule']),
    [firstMonth, lastMonth],
  );
  const { data: schedules } = useQuery<OpenSchedule>(
    () =>
      q('schedules')
        .filter({ completed: false })
        .select(['id', 'next_date', '_payee']),
    [],
  );
  return { transactions, schedules };
}

const PaidBillsContext = createContext<Map<string, BillStatus> | null>(null);

export function PaidBillsProvider({
  months,
  children,
}: {
  months: string[];
  children: ReactNode;
}) {
  const first = months[0];
  const last = months[months.length - 1];
  const { transactions, schedules } = useBillData(first, last);
  const key = months.join(',');
  const value = useMemo(
    () =>
      transactions && schedules
        ? new Map(
            key
              .split(',')
              .map(m => [m, billStatus([...transactions], [...schedules], m)]),
          )
        : null,
    [key, transactions, schedules],
  );
  return (
    <PaidBillsContext.Provider value={value}>
      {children}
    </PaidBillsContext.Provider>
  );
}

export function useBillStatus(month: string): BillStatus | null {
  return useContext(PaidBillsContext)?.get(month) ?? null;
}

// Desktop: bill status for every month the budget table shows.
export function MonthsPaidBillsProvider({ children }: { children: ReactNode }) {
  const { months } = useContext(MonthsContext);
  return <PaidBillsProvider months={months}>{children}</PaidBillsProvider>;
}
