// Custom branch: bills paid through schedules.
//
// A schedule belongs to the category its rule sets ("set category" on the
// schedule's rule). A schedule without one belongs wherever it was linked in
// the last 3 months. A bill category is paid for a month once every schedule
// of it that is due that month has a transaction linked to it.
//
// The projected end of month holds only the bills a bill category still
// owes (like a paper budget with bills checked off), and the budget page
// shows a ✓ on paid bills and on groups whose bills are all paid.
import React, { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';

import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
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
  _payee?: string | null;
  _amount?: number | { num1: number; num2: number } | null;
  _actions?: Array<{ field?: string; op?: string; value?: unknown }> | null;
};

export type BillStatus = {
  // Categories whose bills are all paid this month.
  paid: Set<string>;
  // Categories that have a bill this month, paid or not.
  hasBills: Set<string>;
  // Categories with any bill schedule at all, even one not due this month.
  billCategories: Set<string>;
  // What each bill category still owes this month (a positive amount).
  owed: Map<string, number>;
};

// The category a schedule's rule sets, if any.
function scheduleCategory(s: OpenSchedule): string | null {
  const action = (s._actions ?? []).find(
    a => a.op === 'set' && a.field === 'category' && a.value,
  );
  return action ? String(action.value) : null;
}

function scheduleCost(s: OpenSchedule): number {
  const raw = s._amount;
  const amount =
    typeof raw === 'number' ? raw : raw ? (raw.num1 + raw.num2) / 2 : 0;
  return Math.max(0, -Math.round(amount));
}

export function billStatus(
  transactions: LinkedTransaction[],
  schedules: OpenSchedule[],
  month: string,
): BillStatus {
  const lookbackStart = monthUtils.firstDayOfMonth(
    monthUtils.subMonths(month, LOOKBACK_MONTHS),
  );
  const monthEnd = monthUtils.lastDayOfMonth(month);
  const linkedThisMonth = new Set<string>();
  const paidThisMonth = new Set<string>();
  const belongs = new Map<string, Set<string>>();
  const add = (category: string, id: string) => {
    const set = belongs.get(category) ?? new Set<string>();
    set.add(id);
    belongs.set(category, set);
  };
  // A schedule whose rule sets a category belongs to that category.
  // Otherwise it belongs wherever it was linked lately.
  const withCategory = new Set<string>();
  for (const s of schedules) {
    const category = scheduleCategory(s);
    if (category) {
      add(category, s.id);
      withCategory.add(s.id);
    }
  }
  for (const t of transactions) {
    if (!t.schedule || t.date < lookbackStart || t.date > monthEnd) continue;
    if (monthUtils.monthFromDate(t.date) === month) {
      paidThisMonth.add(t.schedule);
      if (t.category) linkedThisMonth.add(t.category);
    }
    if (t.category && !withCategory.has(t.schedule)) {
      add(t.category, t.schedule);
    }
  }
  const open = new Map(schedules.map(s => [s.id, s]));
  const paid = new Set<string>();
  const hasBills = new Set<string>();
  const billCategories = new Set<string>();
  const owed = new Map<string, number>();
  for (const [category, ids] of belongs) {
    billCategories.add(category);
    let stillOwed = 0;
    let anyThisMonth = false;
    let anyUnpaid = false;
    for (const id of ids) {
      if (paidThisMonth.has(id)) {
        anyThisMonth = true;
        continue;
      }
      const s = open.get(id);
      if (s?.next_date && s.next_date <= monthEnd) {
        anyThisMonth = true;
        anyUnpaid = true;
        stillOwed += scheduleCost(s);
      }
    }
    owed.set(category, stillOwed);
    if (!anyThisMonth) continue;
    hasBills.add(category);
    if (linkedThisMonth.has(category) && !anyUnpaid) paid.add(category);
  }
  return { paid, hasBills, billCategories, owed };
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
        .select(['id', 'next_date', '_payee', '_amount', '_actions']),
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

// Desktop: the ✓ column at the start of each month, between the category
// names and the Budget column.
export const CHECK_COLUMN_WIDTH = 22;

export function CheckField({ paid }: { paid: boolean }) {
  return (
    <View
      style={{
        width: CHECK_COLUMN_WIDTH,
        flexShrink: 0,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {paid && <Text style={{ color: theme.tableText }}>✓</Text>}
    </View>
  );
}
