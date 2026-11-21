// Custom branch: the Income page. Shows each paycheck for a month (gross,
// pre-tax, taxes, after-tax, net), the month's total, the year's totals,
// and a button that puts the month's net pay into income categories.
import React, { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { useResponsive } from '@actual-app/components/hooks/useResponsive';
import {
  SvgCheveronLeft,
  SvgCheveronRight,
} from '@actual-app/components/icons/v1';
import { Select } from '@actual-app/components/select';
import { styles } from '@actual-app/components/styles';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { spacing } from '@actual-app/components/tokens';
import { View } from '@actual-app/components/view';
import { send } from '@actual-app/core/platform/client/connection';
import * as monthUtils from '@actual-app/core/shared/months';
import {
  computeYear,
  stateInfo,
  taxYearFor,
  yearTotals,
} from '@actual-app/core/shared/paycheck/paycheck';
import type { PaycheckResult } from '@actual-app/core/shared/paycheck/types';
import { amountToInteger } from '@actual-app/core/shared/util';

import { Link } from '#components/common/Link';
import { MOBILE_NAV_HEIGHT } from '#components/mobile/MobileNavTabs';
import { Page } from '#components/Page';
import { useCategories } from '#hooks/useCategories';
import { useLocale } from '#hooks/useLocale';
import { useSyncedPref } from '#hooks/useSyncedPref';

import { usePaycheckConfig } from './usePaycheckConfig';

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

export function money(value: number): string {
  return usd.format(value);
}

export function Card({
  title,
  right,
  children,
}: {
  title?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <View
      style={{
        backgroundColor: theme.tableBackground,
        border: `1px solid ${theme.tableBorder}`,
        borderRadius: 6,
        flexShrink: 0,
        padding: spacing.lg,
        gap: spacing.xs,
      }}
    >
      {(title || right) && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: spacing.xs,
            gap: spacing.sm,
          }}
        >
          <Text style={{ ...styles.mediumText, fontWeight: 600 }}>{title}</Text>
          {right}
        </View>
      )}
      {children}
    </View>
  );
}

export function Line({
  label,
  value,
  bold,
  big,
  subdued,
  note,
}: {
  label: ReactNode;
  value: number;
  bold?: boolean;
  big?: boolean;
  subdued?: boolean;
  note?: ReactNode;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        gap: spacing.sm,
        color: subdued ? theme.pageTextSubdued : theme.pageText,
        fontWeight: bold || big ? 600 : 400,
        fontSize: big ? 22 : undefined,
      }}
    >
      <Text>
        {label}
        {note && (
          <Text
            style={{
              ...styles.verySmallText,
              color: theme.pageTextSubdued,
              marginLeft: 6,
            }}
          >
            {note}
          </Text>
        )}
      </Text>
      <Text style={{ fontVariantNumeric: 'tabular-nums' }}>{money(value)}</Text>
    </View>
  );
}

function SectionLabel({
  children,
  total,
}: {
  children: ReactNode;
  total: number;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: spacing.sm,
        paddingTop: spacing.sm,
        borderTop: `1px solid ${theme.tableBorder}`,
        ...styles.verySmallText,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        color: theme.pageTextSubdued,
        fontWeight: 600,
      }}
    >
      <Text>{children}</Text>
      <Text>{money(total)}</Text>
    </View>
  );
}

export function StatusBadge({ status }: { status: PaycheckResult['status'] }) {
  const actual = status === 'actual';
  return (
    <Text
      style={{
        ...styles.verySmallText,
        fontWeight: 600,
        padding: '2px 8px',
        borderRadius: 10,
        color: actual ? theme.noticeTextDark : theme.pageTextSubdued,
        backgroundColor: actual ? theme.noticeBackgroundLight : 'transparent',
        border: actual ? 'none' : `1px solid ${theme.tableBorder}`,
      }}
    >
      {actual ? <Trans>Actual</Trans> : <Trans>Estimated</Trans>}
    </Text>
  );
}

// Row counts to pad each card to, so checks side by side line up.
type CardRows = { pay: number; pretax: number; taxes: number; posttax: number };

function payRows(c: PaycheckResult) {
  return c.hourPay.length + (c.extraPay !== 0 ? 1 : 0);
}
function extraTaxRows(c: PaycheckResult) {
  return (c.taxes.local !== 0 ? 1 : 0) + c.taxes.other.length;
}

function cardRows(checks: PaycheckResult[]): CardRows {
  const max = (f: (c: PaycheckResult) => number) =>
    checks.reduce((m, c) => Math.max(m, f(c)), 0);
  return {
    pay: max(payRows),
    pretax: max(c => c.pretax.length),
    taxes: max(extraTaxRows),
    posttax: max(c => c.posttax.length),
  };
}

function Blanks({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: Math.max(0, count) }, (_, i) => (
        <Text key={i} aria-hidden>
          {'\u00a0'}
        </Text>
      ))}
    </>
  );
}

function CheckCard({
  check,
  title,
  stateName,
  rows,
}: {
  check: PaycheckResult;
  title: string;
  stateName: string | null;
  rows: CardRows;
}) {
  const { t } = useTranslation();
  const locale = useLocale();
  const fed = taxYearFor(Number(check.date.slice(0, 4))).federal;
  const ssCapped =
    check.taxes.socialSecurity === 0 &&
    check.ytd.ssWages - check.ssWages >= fed.socialSecurityWageBase;

  return (
    <View style={{ flex: '1 1 300px', minWidth: 0 }}>
      <Card
        title={
          <>
            {title}
            <Text
              style={{
                ...styles.smallText,
                color: theme.pageTextSubdued,
                fontWeight: 400,
                marginLeft: 8,
              }}
            >
              {monthUtils.format(check.date, 'MMM d', locale)}
            </Text>
          </>
        }
        right={<StatusBadge status={check.status} />}
      >
        {check.hourPay.map(l => (
          <Line key={l.id} label={l.name} value={l.amount} />
        ))}
        {check.extraPay !== 0 && (
          <Line label={t('Extra pay')} value={check.extraPay} />
        )}
        <Blanks count={rows.pay - payRows(check)} />
        <Line label={t('Gross pay')} value={check.gross} bold />

        {rows.pretax > 0 && (
          <>
            <SectionLabel total={check.pretaxTotal}>
              <Trans>Before taxes</Trans>
            </SectionLabel>
            {check.pretax.map(l => (
              <Line key={l.id} label={l.name} value={l.amount} />
            ))}
            <Blanks count={rows.pretax - check.pretax.length} />
          </>
        )}

        <SectionLabel total={check.taxTotal}>
          <Trans>Taxes</Trans>
        </SectionLabel>
        <Line label={t('Federal')} value={check.taxes.federal} />
        <Line
          label={t('Social Security')}
          value={check.taxes.socialSecurity}
          note={ssCapped ? t('yearly max reached') : undefined}
        />
        <Line label={t('Medicare')} value={check.taxes.medicare} />
        {stateName && <Line label={stateName} value={check.taxes.state} />}
        {check.taxes.local !== 0 && (
          <Line label={t('City or county')} value={check.taxes.local} />
        )}
        {check.taxes.other.map(l => (
          <Line key={l.id} label={l.name} value={l.amount} />
        ))}
        <Blanks count={rows.taxes - extraTaxRows(check)} />

        {rows.posttax > 0 && (
          <>
            <SectionLabel total={check.posttaxTotal}>
              <Trans>After taxes</Trans>
            </SectionLabel>
            {check.posttax.map(l => (
              <Line key={l.id} label={l.name} value={l.amount} />
            ))}
            <Blanks count={rows.posttax - check.posttax.length} />
          </>
        )}

        <View
          style={{
            marginTop: spacing.sm,
            paddingTop: spacing.sm,
            borderTop: `2px solid ${theme.tableBorder}`,
          }}
        >
          <Line label={t('Net pay')} value={check.net} big />
        </View>
      </Card>
    </View>
  );
}

function PutInBudget({
  month,
  checks,
  keyOf,
  labelOf,
}: {
  month: string;
  checks: PaycheckResult[];
  keyOf: (check: PaycheckResult) => string;
  labelOf: (key: string) => string;
}) {
  const { t } = useTranslation();
  const locale = useLocale();
  const { income, setIncome } = usePaycheckConfig();
  const { data: categories } = useCategories();
  const [status, setStatus] = useState<string | null>(null);

  const incomeCategories = (categories?.grouped ?? [])
    .filter(g => g.is_income && !g.hidden)
    .flatMap(g => (g.categories ?? []).filter(c => !c.hidden));

  // One line per check and pay line (e.g. "20th check · Overages"), so each
  // can go to its own income category. Taxes stay with the check; see
  // netByLine for how a check's net is split.
  const totals = new Map<string, number>();
  const labels = new Map<string, string>();
  for (const c of checks) {
    for (const line of c.netSplit) {
      const key = `${keyOf(c)}:${line.id}`;
      totals.set(key, (totals.get(key) ?? 0) + line.amount);
      labels.set(key, `${labelOf(keyOf(c))} · ${line.name}`);
    }
  }

  const chosen = income.budgetCategories ?? {};
  const choose = (key: string, category: string) => {
    setStatus(null);
    const next = { ...chosen };
    if (category) {
      next[key] = category;
    } else {
      delete next[key];
    }
    setIncome({ ...income, budgetCategories: next });
  };

  const apply = async (target: string) => {
    const byCategory = new Map<string, number>();
    for (const [key, total] of totals) {
      const category = chosen[key];
      if (category) {
        byCategory.set(category, (byCategory.get(category) ?? 0) + total);
      }
    }
    for (const [category, total] of byCategory) {
      await send('budget/budget-amount-only-this-month', {
        month: target,
        category,
        amount: amountToInteger(Math.round(total * 100) / 100),
      });
    }
    setStatus(
      t('Done. Budget set for {{month}}.', {
        month: monthUtils.format(target, 'MMMM yyyy', locale),
      }),
    );
  };

  const options: Array<[string, string]> = [
    ['', t('Leave out')],
    ...incomeCategories.map(c => [c.id, c.name] as [string, string]),
  ];
  const anyChosen = [...totals.keys()].some(k => chosen[k]);

  return (
    <Card title={t('Planned income')}>
      <Text style={{ ...styles.smallText, color: theme.pageTextSubdued }}>
        <Trans>
          Pick an income category for each line, then add these amounts to this
          month's budget. Use the arrows at the top to plan a future month. Only
          these categories change. Undo (Ctrl+Z) takes it back.
        </Trans>
      </Text>
      {[...totals.entries()].map(([key, total]) => (
        <View
          key={key}
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: spacing.sm,
            paddingTop: spacing.xs,
          }}
        >
          <Text style={{ flex: '1 1 140px' }}>
            {labels.get(key)}{' '}
            <Text style={{ fontWeight: 600 }}>{money(total)}</Text>
          </Text>
          <Select
            value={chosen[key] ?? ''}
            onChange={category => choose(key, category)}
            options={options}
          />
        </View>
      ))}
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: spacing.md,
          marginTop: spacing.sm,
        }}
      >
        <Button
          variant="primary"
          isDisabled={!anyChosen}
          onPress={() => void apply(month)}
        >
          <Trans>
            Add to {{ month: monthUtils.format(month, 'MMMM', locale) }}'s
            budget
          </Trans>
        </Button>
        {status && (
          <Text style={{ ...styles.smallText, color: theme.noticeTextLight }}>
            {status}
          </Text>
        )}
      </View>
    </Card>
  );
}

function SetupNote() {
  return (
    <Card>
      <Text style={{ lineHeight: 1.6 }}>
        <Trans>
          To see your paychecks, fill in{' '}
          <Link variant="internal" to="/settings/income">
            Settings → Income
          </Link>
          ,{' '}
          <Link variant="internal" to="/settings/taxes">
            Taxes
          </Link>
          , and{' '}
          <Link variant="internal" to="/settings/deductions">
            Deductions
          </Link>
          .
        </Trans>
      </Text>
    </Card>
  );
}

function MonthNav({
  month,
  onChange,
}: {
  month: string;
  onChange: (month: string) => void;
}) {
  const { t } = useTranslation();
  const locale = useLocale();
  const current = monthUtils.currentMonth();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Button
        variant="bare"
        aria-label={t('Previous month')}
        onPress={() => onChange(monthUtils.prevMonth(month))}
      >
        <SvgCheveronLeft width={14} height={14} />
      </Button>
      <Text
        style={{
          ...styles.mediumText,
          fontWeight: 600,
          minWidth: 150,
          textAlign: 'center',
        }}
      >
        {monthUtils.format(month, 'MMMM yyyy', locale)}
      </Text>
      <Button
        variant="bare"
        aria-label={t('Next month')}
        onPress={() => onChange(monthUtils.nextMonth(month))}
      >
        <SvgCheveronRight width={14} height={14} />
      </Button>
      {month !== current && (
        <Button variant="bare" onPress={() => onChange(current)}>
          <Trans>Current month</Trans>
        </Button>
      )}
    </View>
  );
}

export function IncomePage() {
  const { t } = useTranslation();
  const { isNarrowWidth } = useResponsive();
  const { config, income, tax, isSetUp } = usePaycheckConfig();
  const [budgetType = 'envelope'] = useSyncedPref('budgetType');
  const [month, setMonth] = useState(() => monthUtils.currentMonth());
  const year = Number(month.slice(0, 4));

  const yearChecks = useMemo(() => computeYear(year, config), [year, config]);
  const checks = yearChecks.filter(c => c.date.startsWith(month));
  const rows = cardRows(checks);
  const totals = yearTotals(yearChecks);
  const monthNet = checks.reduce((s, c) => s + c.net, 0);
  const state = stateInfo(tax, taxYearFor(year));
  const stateName =
    state && state.kind !== 'none'
      ? t('{{name}} state', { name: state.name })
      : null;

  const byDay =
    income.frequency === 'semimonthly' || income.frequency === 'monthly';
  const paydayName = (id: string | null) =>
    income.paydays.find(p => p.id === id)?.name ?? '';
  const titleOf = (c: PaycheckResult) =>
    byDay && income.paydays.length > 1
      ? t('{{name}} check', { name: paydayName(c.paydayId) })
      : t('Paycheck');
  const keyOf = (c: PaycheckResult) => (byDay ? (c.paydayId ?? 'all') : 'all');
  const labelOf = (key: string) =>
    key === 'all'
      ? t('Paychecks')
      : t('{{name}} check', { name: paydayName(key) });

  return (
    <Page header={t('Income')}>
      <View
        style={{
          gap: spacing.lg,
          maxWidth: 1000,
          flexShrink: 0,
          paddingBottom: isNarrowWidth ? MOBILE_NAV_HEIGHT : spacing.xl,
        }}
      >
        <MonthNav month={month} onChange={setMonth} />

        {!isSetUp ? (
          <SetupNote />
        ) : (
          <>
            {checks.length === 0 ? (
              <Card>
                <Text style={{ color: theme.pageTextSubdued }}>
                  <Trans>No paychecks this month.</Trans>
                </Text>
              </Card>
            ) : (
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  flexShrink: 0,
                  gap: spacing.lg,
                  alignItems: 'flex-start',
                }}
              >
                {checks.map(c => (
                  <CheckCard
                    key={c.date}
                    check={c}
                    title={titleOf(c)}
                    stateName={stateName}
                    rows={rows}
                  />
                ))}
              </View>
            )}

            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                flexShrink: 0,
                gap: spacing.lg,
                alignItems: 'flex-start',
              }}
            >
              <View style={{ flex: '1 1 300px', minWidth: 0 }}>
                <Card title={t('This month')}>
                  {checks.map(c => (
                    <Line key={c.date} label={titleOf(c)} value={c.net} />
                  ))}
                  {income.otherMonthlyIncome > 0 && (
                    <Line
                      label={t('Other income')}
                      value={income.otherMonthlyIncome}
                    />
                  )}
                  <View
                    style={{
                      marginTop: spacing.sm,
                      paddingTop: spacing.sm,
                      borderTop: `2px solid ${theme.tableBorder}`,
                    }}
                  >
                    <Line
                      label={t('Monthly take-home')}
                      value={monthNet + income.otherMonthlyIncome}
                      big
                    />
                  </View>
                </Card>
              </View>
              <View style={{ flex: '1 1 300px', minWidth: 0 }}>
                <Card title={t('{{year}} so far + estimated', { year })}>
                  <Line label={t('Gross pay')} value={totals.gross} />
                  <Line label={t('Before taxes')} value={totals.pretax} />
                  <Line label={t('Taxes')} value={totals.taxes} />
                  <Line label={t('After taxes')} value={totals.posttax} />
                  <Line label={t('Take-home')} value={totals.net} bold />
                </Card>
              </View>
            </View>

            {budgetType === 'tracking' && checks.length > 0 && (
              <PutInBudget
                month={month}
                checks={checks}
                keyOf={keyOf}
                labelOf={labelOf}
              />
            )}
          </>
        )}
      </View>
    </Page>
  );
}
