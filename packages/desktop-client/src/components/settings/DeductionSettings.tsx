// Custom branch: Settings → Deductions. Pre-tax and post-tax lines taken
// out of each check on the Income page.
import React from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Select } from '@actual-app/components/select';
import type {
  Deduction,
  DeductionKind,
} from '@actual-app/core/shared/paycheck/types';

import {
  AddButton,
  ChecksSelect,
  EmptyNote,
  Field,
  ItemRow,
  newId,
  NumberField,
  RemoveButton,
  TextField,
} from '#components/income/fields';
import { usePaycheckConfig } from '#components/income/usePaycheckConfig';

import { SettingsGroup } from './SettingsGroup';

import { SettingsSections } from './index';

function DeductionRow({
  deduction,
  showKind,
  onChange,
  onRemove,
}: {
  deduction: Deduction;
  showKind: boolean;
  onChange: (patch: Partial<Deduction>) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const { income } = usePaycheckConfig();
  const byDay =
    income.frequency === 'semimonthly' || income.frequency === 'monthly';
  const isPercent = deduction.mode === 'percent';

  return (
    <ItemRow>
      <Field label={t('Name')}>
        <TextField
          label={t('Name')}
          value={deduction.name}
          onChange={name => onChange({ name })}
          width={140}
        />
      </Field>
      {showKind && (
        <Field label={t('Type')}>
          <Select<DeductionKind>
            value={deduction.kind}
            onChange={kind => onChange({ kind })}
            options={[
              ['retirement', t('401(k) / 403(b)')],
              ['section125', t('Medical, dental, vision, HSA')],
            ]}
          />
        </Field>
      )}
      <Field label={t('How')}>
        <Select<Deduction['mode']>
          value={deduction.mode}
          onChange={mode => onChange({ mode })}
          options={[
            ['amount', t('Dollars')],
            ['percent', t('% of pay')],
          ]}
        />
      </Field>
      <Field label={isPercent ? t('Percent') : t('Amount')}>
        <NumberField
          label={isPercent ? t('Percent') : t('Amount')}
          prefix={isPercent ? undefined : '$'}
          suffix={isPercent ? '%' : undefined}
          value={deduction.value}
          onChange={value => onChange({ value })}
          width={80}
        />
      </Field>
      {byDay && income.paydays.length > 1 && (
        <Field label={t('On')}>
          <ChecksSelect
            value={deduction.checks}
            paydays={income.paydays}
            onChange={checks => onChange({ checks })}
          />
        </Field>
      )}
      <RemoveButton
        label={t('Remove {{name}}', { name: deduction.name })}
        onPress={onRemove}
      />
    </ItemRow>
  );
}

export function DeductionSettings() {
  const { t } = useTranslation();
  const { deductions, setDeductions } = usePaycheckConfig();

  const change = (id: string, patch: Partial<Deduction>) =>
    setDeductions(deductions.map(d => (d.id === id ? { ...d, ...patch } : d)));
  const remove = (id: string) =>
    setDeductions(deductions.filter(d => d.id !== id));
  const add = (kind: DeductionKind, name: string) =>
    setDeductions([
      ...deductions,
      { id: newId(), name, kind, mode: 'amount', value: 0, checks: 'all' },
    ]);

  const pretax = deductions.filter(d => d.kind !== 'posttax');
  const posttax = deductions.filter(d => d.kind === 'posttax');

  return (
    <SettingsSections title={t('Deductions')}>
      <SettingsGroup
        title={t('Before taxes')}
        description={
          <Trans>
            Taken out before taxes. 401(k) and 403(b) lower income tax only.
            Medical, dental, vision, and HSA lower Social Security and Medicare
            too. "% of pay" is figured on your hourly pay.
          </Trans>
        }
      >
        {pretax.length === 0 && (
          <EmptyNote>
            <Trans>None yet.</Trans>
          </EmptyNote>
        )}
        {pretax.map(d => (
          <DeductionRow
            key={d.id}
            deduction={d}
            showKind
            onChange={patch => change(d.id, patch)}
            onRemove={() => remove(d.id)}
          />
        ))}
        <AddButton onPress={() => add('section125', t('Medical'))}>
          <Trans>Add a pre-tax deduction</Trans>
        </AddButton>
      </SettingsGroup>

      <SettingsGroup
        title={t('After taxes')}
        description={
          <Trans>
            Taken out after taxes, like union dues, life insurance, or a Roth
            401(k).
          </Trans>
        }
      >
        {posttax.length === 0 && (
          <EmptyNote>
            <Trans>None yet.</Trans>
          </EmptyNote>
        )}
        {posttax.map(d => (
          <DeductionRow
            key={d.id}
            deduction={d}
            showKind={false}
            onChange={patch => change(d.id, patch)}
            onRemove={() => remove(d.id)}
          />
        ))}
        <AddButton onPress={() => add('posttax', t('Union dues'))}>
          <Trans>Add an after-tax deduction</Trans>
        </AddButton>
      </SettingsGroup>
    </SettingsSections>
  );
}
