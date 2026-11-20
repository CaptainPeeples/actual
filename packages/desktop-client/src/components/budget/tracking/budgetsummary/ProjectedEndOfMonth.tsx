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
//
// Next month shows the same thing one month ahead: where the current month
// ends (balance + income still coming - bills not paid yet), plus next
// month's income, minus next month's bills, minus the month after's
// budgeted expenses. On the 1st it becomes the current month and the same
// math carries on with real balances, so the number doesn't jump.
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
import { weekIsOver } from '@actual-app/core/shared/weekly-categories';
import { css } from '@emotion/css';

import { billStatus, useBillData } from '#components/budget/paidBills';
import { makeAmountFullStyle } from '#components/budget/util';
import { FinancialText } from '#components/FinancialText';
import { PrivacyFilter } from '#components/PrivacyFilter';
import { useCategories } from '#hooks/useCategories';
import { useFormat } from '#hooks/useFormat';
import { useLocale } from '#hooks/useLocale';
import { useSheetValue } from '#hooks/useSheetValue';
import { aqlQuery } from '#queries/aqlQuery';
import { onBudgetAccountBalance } from '#spreadsheet/bindings';

type MonthCells = Array<{ name: string; value: string | number | boolean }>;

function cellValue(cells: MonthCells, field: string): number {
  const cell = cells.find(c => c.name.endsWith('!' + field));
  return typeof cell?.value === 'number' ? cell.value : 0;
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

type MonthParts = {
  // Income still coming this month.
  incomeLeft: number;
  // Bills not paid yet this month.
  unpaid: number;
};

type Parts = MonthParts & {
  balance: number;
  // Budgeted expenses for the month after the one shown.
  nextMonth: number;
  // Set when the month shown is next month: that month's own income and
  // bills, on top of where the current month ends.
  following?: MonthParts;
};

// The current month ends with the account balance, plus income still coming,
// minus bills not paid yet.
export function currentMonthEnds(parts: Parts) {
  return parts.balance + parts.incomeLeft - parts.unpaid;
}

// Current month:  balance + income left - unpaid bills - next month's bills.
// Next month:     where the current month ends + that month's income - its
//                 bills - the month after's bills. On the 1st, next month
//                 becomes the current month and the same math continues
//                 with real balances.
export function projectedFromParts(parts: Parts) {
  const ends = currentMonthEnds(parts);
  const following = parts.following
    ? parts.following.incomeLeft - parts.following.unpaid
    : 0;
  return ends + following - parts.nextMonth;
}

// True for the months that show "Projected end of month": the current
// month and the one after it.
export function showsProjectedEndOfMonth(month: string) {
  const current = monthUtils.currentMonth();
  return month === current || month === monthUtils.addMonths(current, 1);
}

function useSheetTotals(month: string) {
  // Watch a month's sheet by its full name so it works inside any month's
  // column.
  const sheet = monthUtils.sheetForMonth(month);
  const budgeted = useSheetValue<'tracking-budget', 'total-budgeted'>(
    `${sheet}!total-budgeted` as 'total-budgeted',
  );
  const spent = useSheetValue<'tracking-budget', 'total-spent'>(
    `${sheet}!total-spent` as 'total-spent',
  );
  const income = useSheetValue<'tracking-budget', 'total-income'>(
    `${sheet}!total-income` as 'total-income',
  );
  const budgetedIncome = useSheetValue<'tracking-budget', 'total-budget-income'>(
    `${sheet}!total-budget-income` as 'total-budget-income',
  );
  return [budgeted, spent, income, budgetedIncome].join(',');
}

type ProjectedEndOfMonthProps = {
  month: string;
  style?: CSSProperties;
};

// Shared by the desktop box and the mobile header. Works for the current
// month and for next month.
export function useProjectedEndOfMonth(month: string) {
  const { data: categories } = useCategories();
  const current = monthUtils.currentMonth();
  const isNext = month === monthUtils.addMonths(current, 1);
  const base = isNext ? current : month;
  const after = monthUtils.addMonths(month, 1);

  // Changes to any of these mean the projection needs recalculating.
  const baseTotals = useSheetTotals(base);
  const followingTotals = useSheetTotals(monthUtils.addMonths(base, 1));
  const afterTotals = useSheetTotals(monthUtils.addMonths(base, 2));

  const { transactions: linked, schedules: openSchedules } = useBillData(
    base,
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

    const monthParts = (m: string, cells: MonthCells): MonthParts => {
      const { owed } = billStatus(
        [...(linked ?? [])],
        [...(openSchedules ?? [])],
        m,
      );
      const isOver = (id: string) => weekIsOver(names.get(id) ?? '', m, today);
      return {
        incomeLeft: incomeStillComing(cells, incomeIds),
        unpaid: unpaidBills(cells, expenseIds, isOver, owed),
      };
    };

    void (async () => {
      const [baseCells, monthCells, afterCells, balanceResult] =
        await Promise.all([
          send('tracking-budget-month', { month: base }),
          isNext
            ? send('tracking-budget-month', { month })
            : Promise.resolve(null),
          send('tracking-budget-month', { month: after }),
          aqlQuery(onBudgetAccountBalance().query),
        ]);
      if (cancelled) return;
      setParts({
        balance: (balanceResult.data as number) || 0,
        ...monthParts(base, baseCells || []),
        nextMonth: cellValue(afterCells || [], 'total-budgeted'),
        following: isNext ? monthParts(month, monthCells || []) : undefined,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [
    month,
    base,
    after,
    isNext,
    categories,
    baseTotals,
    followingTotals,
    afterTotals,
    linked,
    openSchedules,
  ]);

  const projected = parts ? projectedFromParts(parts) : 0;

  return { parts, projected };
}

export function ProjectedEndOfMonth({
  month,
  style,
}: ProjectedEndOfMonthProps) {
  const { t } = useTranslation();
  const format = useFormat();
  const locale = useLocale();
  const { parts, projected } = useProjectedEndOfMonth(month);
  const monthName = (m: string) => monthUtils.format(m, 'MMMM', locale);

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
          parts &&
          (parts.following ? (
            <>
              {row(
                t('{{month}} ends with:', {
                  month: monthName(monthUtils.subMonths(month, 1)),
                }),
                currentMonthEnds(parts),
              )}
              {row(
                t('{{month}} income:', { month: monthName(month) }),
                parts.following.incomeLeft,
              )}
              {row(
                t('{{month}} bills:', { month: monthName(month) }),
                -parts.following.unpaid,
              )}
              {row(
                t('{{month}} bills:', {
                  month: monthName(monthUtils.addMonths(month, 1)),
                }),
                -parts.nextMonth,
              )}
            </>
          ) : (
            <>
              {row(t('Account balance:'), parts.balance)}
              {row(t('Income still coming:'), parts.incomeLeft)}
              {row(t('Bills not paid yet:'), -parts.unpaid)}
              {row(t("Next month's bills:"), -parts.nextMonth)}
            </>
          ))
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
              {parts ? format(projected, 'financial-dollars') : '…'}
            </FinancialText>
          </PrivacyFilter>
        </View>
      </Tooltip>
    </View>
  );
}
