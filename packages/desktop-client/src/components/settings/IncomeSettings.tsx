// Custom branch: Settings → Income. Pay rate, pay schedule, hours, and
// other income used by the Income page.
import React from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Select } from '@actual-app/components/select';
import { View } from '@actual-app/components/view';
import type {
  HourLine,
  ImputedLine,
  IncomeSettings,
  PayFrequency,
  PerDiem,
} from '@actual-app/core/shared/paycheck/types';

import { Checkbox } from '#components/forms';
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
import { SettingsRow } from './SettingsRow';

import { SettingsSections } from './index';

function ordinal(day: number): string {
  const n = Math.round(day);
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) {
    return `${n}th`;
  }
  return `${n}${{ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th'}`;
}

export function IncomePaySettings() {
  const { t } = useTranslation();
  const { income, setIncome } = usePaycheckConfig();

  const update = (patch: Partial<IncomeSettings>) =>
    setIncome({ ...income, ...patch });

  const byDay =
    income.frequency === 'semimonthly' || income.frequency === 'monthly';

  const setFrequency = (frequency: PayFrequency) => {
    let paydays = income.paydays;
    if (frequency === 'semimonthly' && paydays.length !== 2) {
      paydays = [
        paydays[0] ?? { id: newId(), name: '1st', day: 1 },
        { id: newId(), name: '15th', day: 15 },
      ];
    } else if (frequency === 'monthly' && paydays.length !== 1) {
      paydays = [paydays[0] ?? { id: newId(), name: '1st', day: 1 }];
    }
    update({ frequency, paydays });
  };

  const setPayday = (index: number, day: number) => {
    const clamped = Math.min(31, Math.max(1, Math.round(day) || 1));
    update({
      paydays: income.paydays.map((p, i) =>
        i === index ? { ...p, day: clamped, name: ordinal(clamped) } : p,
      ),
    });
  };

  const setLine = (id: string, patch: Partial<HourLine>) =>
    update({
      hourLines: income.hourLines.map(l =>
        l.id === id ? { ...l, ...patch } : l,
      ),
    });

  const setImputed = (id: string, patch: Partial<ImputedLine>) =>
    update({
      imputed: income.imputed.map(l => (l.id === id ? { ...l, ...patch } : l)),
    });

  const perDiem: PerDiem = income.perDiem ?? {
    enabled: false,
    rate: 0,
    hours: 0,
    checks: 'all',
    taxed: false,
  };
  const setPerDiem = (patch: Partial<PerDiem>) =>
    update({ perDiem: { ...perDiem, ...patch } });

  const rates = [...income.rates].sort((a, b) =>
    (a.from || '').localeCompare(b.from || ''),
  );

  return (
    <SettingsSections title={t('Income')}>
      <SettingsGroup
        title={t('Pay schedule')}
        description={
          <Trans>
            How often you get paid. The Income page uses this to list your
            checks.
          </Trans>
        }
      >
        <SettingsRow
          title={t('How often')}
          control={
            <Select<PayFrequency>
              value={income.frequency}
              onChange={setFrequency}
              options={[
                ['weekly', t('Every week')],
                ['biweekly', t('Every 2 weeks')],
                ['semimonthly', t('Twice a month')],
                ['monthly', t('Once a month')],
              ]}
            />
          }
        />
        {byDay ? (
          income.paydays.map((p, i) => (
            <SettingsRow
              key={p.id}
              title={
                income.paydays.length > 1
                  ? t('Payday {{n}}', { n: i + 1 })
                  : t('Payday')
              }
              description={t(
                'Day of the month. Short months use their last day.',
              )}
              control={
                <NumberField
                  label={t('Payday {{n}}', { n: i + 1 })}
                  value={p.day}
                  onChange={day => setPayday(i, day)}
                  width={60}
                />
              }
            />
          ))
        ) : (
          <SettingsRow
            title={t('A recent payday')}
            description={t(
              'Any past or future payday. Others are counted from it.',
            )}
            control={
              <TextField
                label={t('A recent payday')}
                type="date"
                value={income.firstPayDate}
                onChange={firstPayDate => update({ firstPayDate })}
              />
            }
          />
        )}
      </SettingsGroup>

      <SettingsGroup title={t('Hourly rate')}>
        <SettingsRow
          title={t('Starting hourly rate')}
          description={t(
            'Change it month by month in the bar at the top of the Income page. A new rate carries forward to later months.',
          )}
          control={
            <NumberField
              label={t('Starting hourly rate')}
              prefix="$"
              value={rates[0]?.rate ?? 0}
              onChange={rate =>
                update({
                  rates: rates.map((x, j) => (j === 0 ? { ...x, rate } : x)),
                })
              }
            />
          }
        />
      </SettingsGroup>

      <SettingsGroup
        title={t('Hours per check')}
        description={
          <Trans>
            One line per kind of pay. Each line, on each check it's on, gets an
            hours box in the bar at the top of the Income page. The hours here
            are the starting guess for months you haven't filled in. Use "×
            rate" for overtime (1.5).
          </Trans>
        }
      >
        {income.hourLines.length === 0 && (
          <EmptyNote>
            <Trans>No hours yet.</Trans>
          </EmptyNote>
        )}
        {income.hourLines.map(line => (
          <ItemRow key={line.id}>
            <Field label={t('Name')}>
              <TextField
                label={t('Name')}
                value={line.name}
                onChange={name => setLine(line.id, { name })}
                width={140}
              />
            </Field>
            <Field label={t('Hours')}>
              <NumberField
                label={t('Hours')}
                value={line.hours}
                onChange={hours => setLine(line.id, { hours })}
                width={70}
              />
            </Field>
            <Field label={t('× rate')}>
              <NumberField
                label={t('× rate')}
                value={line.multiplier}
                onChange={multiplier =>
                  setLine(line.id, { multiplier: multiplier || 1 })
                }
                width={50}
              />
            </Field>
            {byDay && income.paydays.length > 1 && (
              <Field label={t('On')}>
                <ChecksSelect
                  value={line.checks}
                  paydays={income.paydays}
                  onChange={checks => setLine(line.id, { checks })}
                />
              </Field>
            )}
            <RemoveButton
              label={t('Remove {{name}}', { name: line.name })}
              onPress={() =>
                update({
                  hourLines: income.hourLines.filter(l => l.id !== line.id),
                })
              }
            />
          </ItemRow>
        ))}
        <AddButton
          onPress={() =>
            update({
              hourLines: [
                ...income.hourLines,
                {
                  id: newId(),
                  name: t('Extra hours'),
                  hours: 0,
                  multiplier: 1,
                  checks: 'all',
                },
              ],
            })
          }
        >
          <Trans>Add hours</Trans>
        </AddButton>
      </SettingsGroup>

      <SettingsGroup
        title={t('Per diem')}
        description={
          <Trans>
            Pay per hour away from base. Not taxed unless you check "Taxed." The
            Income page gets a per diem rate box and an hours box.
          </Trans>
        }
      >
        <SettingsRow
          title={t('I get per diem')}
          control={
            <Checkbox
              aria-label={t('I get per diem')}
              checked={perDiem.enabled}
              onChange={e => setPerDiem({ enabled: e.target.checked })}
            />
          }
        />
        {perDiem.enabled && (
          <ItemRow>
            <Field label={t('Per diem rate')}>
              <NumberField
                label={t('Per diem rate')}
                prefix="$"
                value={perDiem.rate}
                onChange={rate => setPerDiem({ rate })}
                width={70}
              />
            </Field>
            <Field label={t('Starting hours')}>
              <NumberField
                label={t('Starting hours')}
                value={perDiem.hours}
                onChange={hours => setPerDiem({ hours })}
                width={70}
              />
            </Field>
            {byDay && income.paydays.length > 1 && (
              <Field label={t('On')}>
                <ChecksSelect
                  value={perDiem.checks}
                  paydays={income.paydays}
                  onChange={checks => setPerDiem({ checks })}
                />
              </Field>
            )}
            <Field label={t('Taxed')}>
              <View style={{ height: 28, justifyContent: 'center' }}>
                <Checkbox
                  aria-label={t('Taxed')}
                  checked={perDiem.taxed}
                  onChange={e => setPerDiem({ taxed: e.target.checked })}
                />
              </View>
            </Field>
          </ItemRow>
        )}
      </SettingsGroup>

      <SettingsGroup
        title={t('Taxed but not paid')}
        description={
          <Trans>
            Amounts on your pay stub that are taxed but never paid to you, like
            group life insurance over $50,000.
          </Trans>
        }
      >
        {income.imputed.map(line => (
          <ItemRow key={line.id}>
            <Field label={t('Name')}>
              <TextField
                label={t('Name')}
                value={line.name}
                onChange={name => setImputed(line.id, { name })}
                width={140}
              />
            </Field>
            <Field label={t('Amount')}>
              <NumberField
                label={t('Amount')}
                prefix="$"
                value={line.amount}
                onChange={amount => setImputed(line.id, { amount })}
                width={80}
              />
            </Field>
            {byDay && income.paydays.length > 1 && (
              <Field label={t('On')}>
                <ChecksSelect
                  value={line.checks}
                  paydays={income.paydays}
                  onChange={checks => setImputed(line.id, { checks })}
                />
              </Field>
            )}
            <RemoveButton
              label={t('Remove {{name}}', { name: line.name })}
              onPress={() =>
                update({
                  imputed: income.imputed.filter(l => l.id !== line.id),
                })
              }
            />
          </ItemRow>
        ))}
        <AddButton
          onPress={() =>
            update({
              imputed: [
                ...income.imputed,
                {
                  id: newId(),
                  name: t('Life insurance'),
                  amount: 0,
                  checks: 'all',
                },
              ],
            })
          }
        >
          <Trans>Add a line</Trans>
        </AddButton>
      </SettingsGroup>

      <SettingsGroup title={t('Other income')}>
        <SettingsRow
          title={t('Other income per month')}
          description={t(
            'Money that comes in outside your paycheck. It is added to the monthly total, not taxed here.',
          )}
          control={
            <NumberField
              label={t('Other income per month')}
              prefix="$"
              value={income.otherMonthlyIncome}
              onChange={otherMonthlyIncome => update({ otherMonthlyIncome })}
            />
          }
        />
      </SettingsGroup>
    </SettingsSections>
  );
}
