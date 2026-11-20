// Custom branch: "Projected end of month" for the current month of a
// tracking budget. It answers "what will my on-budget accounts hold once this
// month's bills are paid and next month's bills are set aside?":
//
//   on-budget account balance
//   + income still expected this month   (per income category:
//                                          budgeted - received, >= 0, so a
//                                          negative "carryover" line or one
//                                          category coming in over budget
//                                          can't cancel out other paychecks)
//   - bills still unpaid this month      (a bill category, one with
//                                          schedules, counts the bills it
//                                          still owes this month; any other
//                                          expense category counts
//                                          budgeted - spent, clamped to
//                                          0..budgeted so refunds and
//                                          overspending don't skew it, and
//                                          a weekly category whose week is
//                                          already over counts 0)
//   - next month's budgeted expenses
import React, { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { AlignedText } from '@actual-app/components/aligned-text';
import { styles } from '@actual-app/components/styles';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { Tooltip } from '@actual-app/components/tooltip';
import { View } from '@actual-app/components/view';
import { send } from '@actual-app/core/platform/client/connection';
import * as monthUtils from '@actual-app/core/shared/months';
import {
  parseWeekName,
  weekOfMonth,
} from '@actual-app/core/shared/weekly-categories';
import { css } from '@emotion/css';

import { billStatus, useBillData } from '#components/budget/paidBills';
import { useTrackingSheetValue } from '#components/budget/tracking/TrackingBudgetComponents';
import { makeAmountFullStyle } from '#components/budget/util';
import { FinancialText } from '#components/FinancialText';
import { PrivacyFilter } from '#components/PrivacyFilter';
import { useCategories } from '#hooks/useCategories';
import { useFormat } from '#hooks/useFormat';
import { useSheetValue } from '#hooks/useSheetValue';
import { aqlQuery } from '#queries/aqlQuery';
import { onBudgetAccountBalance, trackingBudget } from '#spreadsheet/bindings';

type MonthCells = Array<{ name: string; value: string | number | boolean }>;

function cellValue(cells: MonthCells, field: string): number {
  const cell = cells.find(c => c.name.endsWith('!' + field));
  return typeof cell?.value === 'number' ? cell.value : 0;
}

// True when `name` is a weekly category ("<Name> Week N") whose week of
// `month` has already ended as of `today`.
export function weekIsOver(name: string, month: string, today: string) {
  const parsed = parseWeekName(name);
  if (!parsed) return false;
  const current = monthUtils.monthFromDate(today);
  if (month !== current) return month < current;
  return weekOfMonth(today) > parsed.week;
}

export function unpaidBills(
  cells: MonthCells,
  expenseIds: string[],
  isOver: (id: string) => boolean = () => false,
  billsOwed: Map<string, number> = new Map(),
) {
  let total = 0;
  for (const id of expenseIds) {
    const owed = billsOwed.get(id);
    if (owed !== undefined) {
      total += owed;
      continue;
    }
    if (isOver(id)) continue;
    const budgeted = cellValue(cells, `budget-${id}`);
    const spent = cellValue(cells, `sum-amount-${id}`);
    total += Math.max(0, Math.min(budgeted, budgeted + spent));
  }
  return total;
}

export function incomeStillComing(cells: MonthCells, incomeIds: string[]) {
  let total = 0;
  for (const id of incomeIds) {
    const budgeted = cellValue(cells, `budget-${id}`);
    const received = cellValue(cells, `sum-amount-${id}`);
    total += Math.max(0, budgeted - received);
  }
  return total;
}

type Parts = {
  balance: number;
  incomeLeft: number;
  unpaid: number;
  nextMonth: number;
};

type ProjectedEndOfMonthProps = {
  month: string;
  style?: CSSProperties;
};

// Shared by the desktop box and the mobile header.
export function useProjectedEndOfMonth(month: string) {
  const { data: categories } = useCategories();
  // Changes to any of these mean the projection needs recalculating.
  const budgetedIncome =
    useTrackingSheetValue(trackingBudget.totalBudgetedIncome) || 0;
  const receivedIncome = useTrackingSheetValue(trackingBudget.totalIncome) || 0;
  const totalSpent = useTrackingSheetValue(trackingBudget.totalSpent) || 0;
  const totalBudgeted =
    useTrackingSheetValue(trackingBudget.totalBudgetedExpense) || 0;
  // Next month lives on a different sheet, so watch it by its full name.
  const nextSheet = monthUtils.sheetForMonth(monthUtils.addMonths(month, 1));
  const nextMonthBudgeted =
    useSheetValue<'tracking-budget', 'total-budgeted'>(
      `${nextSheet}!total-budgeted` as 'total-budgeted',
    ) || 0;

  const { transactions: linked, schedules: openSchedules } = useBillData(
    month,
    month,
  );

  const [parts, setParts] = useState<Parts | null>(null);

  useEffect(() => {
    if (!categories) return;
    let cancelled = false;
    const live = categories.list.filter(c => !c.tombstone);
    const expenseIds = live.filter(c => !c.is_income).map(c => c.id);
    const today = monthUtils.currentDay();
    const names = new Map(live.map(c => [c.id, c.name]));
    const incomeIds = live.filter(c => c.is_income).map(c => c.id);
    const { owed } = billStatus(
      [...(linked ?? [])],
      [...(openSchedules ?? [])],
      month,
    );
    const isOver = (id: string) =>
      weekIsOver(names.get(id) ?? '', month, today);

    void (async () => {
      const [thisMonth, nextMonth, balanceResult] = await Promise.all([
        send('tracking-budget-month', { month }),
        send('tracking-budget-month', {
          month: monthUtils.addMonths(month, 1),
        }),
        aqlQuery(onBudgetAccountBalance().query),
      ]);
      if (cancelled) return;
      setParts({
        balance: (balanceResult.data as number) || 0,
        incomeLeft: incomeStillComing(thisMonth || [], incomeIds),
        unpaid: unpaidBills(thisMonth || [], expenseIds, isOver, owed),
        nextMonth: cellValue(nextMonth || [], 'total-budgeted'),
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [
    month,
    categories,
    budgetedIncome,
    receivedIncome,
    totalSpent,
    totalBudgeted,
    nextMonthBudgeted,
    linked,
    openSchedules,
  ]);

  const projected = parts
    ? parts.balance + parts.incomeLeft - parts.unpaid - parts.nextMonth
    : 0;

  return { parts, projected };
}

export function ProjectedEndOfMonth({
  month,
  style,
}: ProjectedEndOfMonthProps) {
  const { t } = useTranslation();
  const format = useFormat();
  const { parts, projected } = useProjectedEndOfMonth(month);

  const row = (label: string, value: number) => (
    <AlignedText
      left={label}
      right={
        <FinancialText style={makeAmountFullStyle(value)}>
          {format(value, 'financial-with-sign')}
        </FinancialText>
      }
    />
  );

  return (
    <View style={{ alignItems: 'center', fontSize: 14, ...style }}>
      <Text style={{ color: theme.pageTextLight }}>
        <Trans>Projected:</Trans>
      </Text>
      <Tooltip
        style={{ ...styles.tooltip, fontSize: 14, padding: 10 }}
        content={
          parts && (
            <>
              {row(t('Account balance:'), parts.balance)}
              {row(t('Income still coming:'), parts.incomeLeft)}
              {row(t('Bills not paid yet:'), -parts.unpaid)}
              {row(t("Next month's bills:"), -parts.nextMonth)}
            </>
          )
        }
        placement="bottom"
      >
        <View
          className={css({
            fontSize: 25,
            color:
              projected < 0
                ? theme.budgetBalanceNegative
                : theme.templateNumberFunded,
          })}
        >
          <PrivacyFilter>
            <FinancialText>
              {parts ? format(projected, 'financial') : '…'}
            </FinancialText>
          </PrivacyFilter>
        </View>
      </Tooltip>
    </View>
  );
}
