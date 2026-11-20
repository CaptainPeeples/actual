// Custom branch: Settings → Default budget.
//
// Laid out like the budget page: each group with its total, and its
// categories below with an amount you can click and change. Every month
// after the current one follows these amounts (see
// server/budget/default-budget).
import React, { useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { useResponsive } from '@actual-app/components/hooks/useResponsive';
import { Input } from '@actual-app/components/input';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import { send } from '@actual-app/core/platform/client/connection';
import type {
  CategoryEntity,
  CategoryGroupEntity,
} from '@actual-app/core/types/models';

import { useCategories } from '#hooks/useCategories';
import { useFormat } from '#hooks/useFormat';
import { useSyncedPref } from '#hooks/useSyncedPref';

import { SettingsSections } from './index';

type Amounts = Record<string, number>;

const ROW_HEIGHT = 36;

function visibleCategories(group: CategoryGroupEntity): CategoryEntity[] {
  return (group.categories ?? []).filter(c => !c.hidden);
}

function groupTotal(group: CategoryGroupEntity, amounts: Amounts) {
  return visibleCategories(group).reduce(
    (sum, c) => sum + (amounts[c.id] ?? 0),
    0,
  );
}

function AmountField({
  amount,
  name,
  onSave,
}: {
  amount: number;
  name: string;
  onSave: (amount: number) => void;
}) {
  const format = useFormat();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');

  const startEditing = () => {
    setText(format.forEdit(amount));
    setEditing(true);
  };

  const save = (value: string) => {
    setEditing(false);
    const parsed = format.fromEdit(value, amount);
    if (parsed != null && parsed !== amount) {
      onSave(parsed);
    }
  };

  if (!editing) {
    return (
      <View
        role="button"
        tabIndex={0}
        aria-label={name}
        onClick={startEditing}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            startEditing();
          }
        }}
        style={{
          width: 130,
          height: ROW_HEIGHT - 8,
          justifyContent: 'center',
          alignItems: 'flex-end',
          paddingRight: 6,
          borderRadius: 4,
          cursor: 'pointer',
          color: amount === 0 ? theme.tableTextSubdued : theme.tableText,
          ':hover': { boxShadow: 'inset 0 0 0 1px ' + theme.tableBorder },
        }}
      >
        {format(amount, 'financial-dollars')}
      </View>
    );
  }

  return (
    <Input
      autoFocus
      inputMode="decimal"
      aria-label={name}
      value={text}
      onChangeValue={setText}
      onEnter={value => save(value)}
      onEscape={() => setEditing(false)}
      onUpdate={value => save(value)}
      onFocus={e => e.currentTarget.select()}
      style={{ width: 130, textAlign: 'right' }}
    />
  );
}

function GroupRows({
  group,
  amounts,
  onSave,
}: {
  group: CategoryGroupEntity;
  amounts: Amounts;
  onSave: (category: string, amount: number) => void;
}) {
  const format = useFormat();
  const categories = visibleCategories(group);
  if (categories.length === 0) {
    return null;
  }
  return (
    <View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          height: ROW_HEIGHT,
          padding: '0 10px',
          backgroundColor: theme.tableRowHeaderBackground,
          color: theme.tableRowHeaderText,
          borderTop: '1px solid ' + theme.tableBorder,
          fontWeight: 600,
        }}
      >
        <Text style={{ flex: 1 }}>{group.name}</Text>
        <Text style={{ width: 130, textAlign: 'right', paddingRight: 6 }}>
          {format(groupTotal(group, amounts), 'financial-dollars')}
        </Text>
      </View>
      {categories.map(category => (
        <View
          key={category.id}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            minHeight: ROW_HEIGHT,
            padding: '0 10px 0 22px',
            backgroundColor: theme.tableBackground,
            color: theme.tableText,
            borderTop: '1px solid ' + theme.tableBorder,
          }}
        >
          <Text style={{ flex: 1 }}>{category.name}</Text>
          <AmountField
            name={category.name}
            amount={amounts[category.id] ?? 0}
            onSave={amount => onSave(category.id, amount)}
          />
        </View>
      ))}
    </View>
  );
}

function Section({
  title,
  total,
  groups,
  amounts,
  onSave,
}: {
  title: string;
  total: number;
  groups: CategoryGroupEntity[];
  amounts: Amounts;
  onSave: (category: string, amount: number) => void;
}) {
  const format = useFormat();
  if (groups.length === 0) {
    return null;
  }
  return (
    <View
      style={{
        borderRadius: 6,
        overflow: 'hidden',
        border: '1px solid ' + theme.tableBorder,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          height: ROW_HEIGHT + 6,
          padding: '0 10px',
          backgroundColor: theme.tableHeaderBackground,
          color: theme.tableHeaderText,
          fontWeight: 600,
        }}
      >
        <Text style={{ flex: 1 }}>{title}</Text>
        <Text style={{ width: 130, textAlign: 'right', paddingRight: 6 }}>
          {format(total, 'financial-dollars')}
        </Text>
      </View>
      {groups.map(group => (
        <GroupRows
          key={group.id}
          group={group}
          amounts={amounts}
          onSave={onSave}
        />
      ))}
    </View>
  );
}

export function DefaultBudgetSettings() {
  const { t } = useTranslation();
  const { isNarrowWidth } = useResponsive();
  const { data: categories } = useCategories();
  const [budgetType = 'envelope'] = useSyncedPref('budgetType');
  const [amounts, setAmounts] = useState<Amounts | null>(null);

  useEffect(() => {
    let active = true;
    void send('budget/default-budget-setup').then(result => {
      if (active) {
        setAmounts(result.amounts);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const onSave = (category: string, amount: number) => {
    setAmounts(prev => ({ ...prev, [category]: amount }));
    void send('budget/default-budget-set', { category, amount });
  };

  const groups = (categories?.grouped ?? []).filter(g => !g.hidden);
  const expenseGroups = groups.filter(g => !g.is_income);
  const incomeGroups =
    budgetType === 'tracking' ? groups.filter(g => g.is_income) : [];
  const sum = (list: CategoryGroupEntity[]) =>
    amounts ? list.reduce((s, g) => s + groupTotal(g, amounts), 0) : 0;

  return (
    <SettingsSections title={t('Default budget')}>
      <View style={{ gap: 6, padding: isNarrowWidth ? '0 10px' : 0 }}>
        <Text style={{ fontSize: 20, fontWeight: 600 }}>
          <Trans>Default budget</Trans>
        </Text>
        <Text style={{ color: theme.pageTextSubdued, lineHeight: 1.5 }}>
          <Trans>
            Every month after this one uses these amounts. Changing one here
            updates all later months right away. Months changed with "Only this
            month" keep their own amount.
          </Trans>
        </Text>
      </View>
      {amounts == null ? (
        <Text style={{ color: theme.pageTextSubdued }}>
          <Trans>Loading…</Trans>
        </Text>
      ) : (
        <View style={{ gap: 20 }}>
          <Section
            title={t('Expenses')}
            total={sum(expenseGroups)}
            groups={expenseGroups}
            amounts={amounts}
            onSave={onSave}
          />
          <Section
            title={t('Income')}
            total={sum(incomeGroups)}
            groups={incomeGroups}
            amounts={amounts}
            onSave={onSave}
          />
        </View>
      )}
    </SettingsSections>
  );
}
