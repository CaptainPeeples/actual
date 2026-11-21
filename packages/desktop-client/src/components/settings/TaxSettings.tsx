// Custom branch: Settings → Taxes. Filing status, W-4, state, and other
// employee taxes used by the Income page.
import React, { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Select } from '@actual-app/components/select';
import { styles } from '@actual-app/components/styles';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { spacing } from '@actual-app/components/tokens';
import { View } from '@actual-app/components/view';
import {
  hasTaxTablesFor,
  stateSupplementalRate,
  taxYearFor,
} from '@actual-app/core/shared/paycheck/paycheck';
import type {
  FilingStatus,
  OtherTax,
  TaxSettings,
  W4,
} from '@actual-app/core/shared/paycheck/types';
import { stateFromZip } from '@actual-app/core/shared/paycheck/zip-to-state';

import { Checkbox } from '#components/forms';
import {
  AddButton,
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

export function TaxSettingsPage() {
  const { t } = useTranslation();
  const { tax, setTax } = usePaycheckConfig();
  const [year] = useState(() => new Date().getFullYear());
  const tables = taxYearFor(year);

  const update = (patch: Partial<TaxSettings>) => setTax({ ...tax, ...patch });
  const updateW4 = (patch: Partial<W4>) =>
    setTax({ ...tax, w4: { ...tax.w4, ...patch } });
  const setOther = (id: string, patch: Partial<OtherTax>) =>
    update({
      otherTaxes: tax.otherTaxes.map(o =>
        o.id === id ? { ...o, ...patch } : o,
      ),
    });

  const zipState = stateFromZip(tax.zip);
  const stateCode = tax.state || zipState;
  const state = stateCode ? tables.states[stateCode] : null;
  const stateOptions: Array<[string, string]> = [
    [
      '',
      zipState
        ? t('From ZIP ({{state}})', {
            state: tables.states[zipState]?.name ?? zipState,
          })
        : t('From ZIP'),
    ],
    ...Object.keys(tables.states)
      .map(code => tables.states[code])
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(s => [s.code, s.name] as [string, string]),
  ];

  const isNew = tax.w4.version === '2020';
  const hasStateTax = state != null && state.kind !== 'none';

  return (
    <SettingsSections title={t('Taxes')}>
      {!hasTaxTablesFor(year) && (
        <Text
          style={{
            ...styles.smallText,
            padding: spacing.md,
            borderRadius: 6,
            backgroundColor: theme.warningBackground,
            color: theme.warningText,
          }}
        >
          <Trans>
            The tax tables are from {{ tableYear: tables.year }}. Numbers for{' '}
            {{ year }} are estimates until the tables are updated.
          </Trans>
        </Text>
      )}

      <SettingsGroup
        title={t('Federal (your W-4)')}
        description={
          <Trans>
            Copy these from your W-4, or from the "Withholding" box on a pay
            stub.
          </Trans>
        }
      >
        <SettingsRow
          title={t('Filing status')}
          control={
            <Select<FilingStatus>
              value={tax.filingStatus}
              onChange={filingStatus => update({ filingStatus })}
              options={[
                ['single', t('Single')],
                ['married', t('Married filing jointly')],
                ['marriedSeparate', t('Married filing separately')],
                ['headOfHousehold', t('Head of household')],
              ]}
            />
          }
        />
        <SettingsRow
          title={t('W-4 form year')}
          description={t(
            'Forms from 2020 on use dollar amounts. Older forms use allowances.',
          )}
          control={
            <Select<W4['version']>
              value={tax.w4.version}
              onChange={version => updateW4({ version })}
              options={[
                ['2020', t('2020 or newer')],
                ['pre2020', t('2019 or older')],
              ]}
            />
          }
        />
        {isNew ? (
          <>
            <SettingsRow
              title={t('Step 2: two jobs box checked')}
              control={
                <Checkbox
                  aria-label={t('Step 2: two jobs box checked')}
                  checked={tax.w4.step2}
                  onChange={e => updateW4({ step2: e.target.checked })}
                />
              }
            />
            <SettingsRow
              title={t('Step 3: dependents')}
              description={t(
                'The total dollar amount. Pay stubs may call it "Total Dependent Amount."',
              )}
              control={
                <NumberField
                  label={t('Step 3: dependents')}
                  prefix="$"
                  value={tax.w4.step3}
                  onChange={step3 => updateW4({ step3 })}
                />
              }
            />
            <SettingsRow
              title={t('Step 4(a): other income')}
              control={
                <NumberField
                  label={t('Step 4(a): other income')}
                  prefix="$"
                  value={tax.w4.step4a}
                  onChange={step4a => updateW4({ step4a })}
                />
              }
            />
            <SettingsRow
              title={t('Step 4(b): deductions')}
              control={
                <NumberField
                  label={t('Step 4(b): deductions')}
                  prefix="$"
                  value={tax.w4.step4b}
                  onChange={step4b => updateW4({ step4b })}
                />
              }
            />
          </>
        ) : (
          <SettingsRow
            title={t('Allowances')}
            control={
              <NumberField
                label={t('Allowances')}
                value={tax.w4.allowances}
                onChange={allowances => updateW4({ allowances })}
                width={60}
              />
            }
          />
        )}
        <SettingsRow
          title={isNew ? t('Step 4(c): extra per check') : t('Extra per check')}
          control={
            <NumberField
              label={t('Extra per check')}
              prefix="$"
              value={tax.w4.step4c}
              onChange={step4c => updateW4({ step4c })}
            />
          }
        />
      </SettingsGroup>

      <SettingsGroup
        title={t('State')}
        description={
          <Trans>
            Your ZIP code picks your state. Pick a state yourself if you work in
            a different one.
          </Trans>
        }
      >
        <SettingsRow
          title={t('ZIP code')}
          control={
            <TextField
              label={t('ZIP code')}
              value={tax.zip}
              onChange={zip => update({ zip: zip.trim() })}
              width={90}
            />
          }
        />
        <SettingsRow
          title={t('State')}
          control={
            <Select
              value={tax.state ?? ''}
              onChange={code => update({ state: code || null })}
              options={stateOptions}
            />
          }
        >
          {state && (
            <Text
              style={{
                ...styles.smallText,
                lineHeight: 1.5,
                color: state.estimate
                  ? theme.warningText
                  : theme.pageTextSubdued,
              }}
            >
              {state.kind === 'none'
                ? t('{{name}} has no state income tax on wages.', {
                    name: state.name,
                  })
                : state.estimate
                  ? t(
                      '{{name}}: this is a close estimate. Its rules have extra steps this page does not do.',
                      { name: state.name },
                    )
                  : t(
                      "{{name}}: figured with the state's own withholding rules.",
                      {
                        name: state.name,
                      },
                    )}
            </Text>
          )}
        </SettingsRow>
        {hasStateTax && (
          <>
            <SettingsRow
              title={t('State allowances')}
              description={t(
                'From your state withholding form. Most people use 0.',
              )}
              control={
                <NumberField
                  label={t('State allowances')}
                  value={tax.stateAllowances}
                  onChange={stateAllowances => update({ stateAllowances })}
                  width={60}
                />
              }
            />
            <SettingsRow
              title={t('Extra state per check')}
              control={
                <NumberField
                  label={t('Extra state per check')}
                  prefix="$"
                  value={tax.stateExtra}
                  onChange={stateExtra => update({ stateExtra })}
                />
              }
            />
          </>
        )}
        <SettingsRow
          title={t('City or county tax')}
          description={t(
            'Only if your city or county takes income tax from your pay.',
          )}
          control={
            <NumberField
              label={t('City or county tax')}
              suffix="%"
              value={tax.localPercent}
              onChange={localPercent => update({ localPercent })}
              width={70}
            />
          }
        />
      </SettingsGroup>

      <SettingsGroup
        title={t('Bonus tax rates')}
        description={
          <Trans>
            How much is taken from a bonus. Leave at 0 to use the usual rates:
            22% federal and your state's bonus rate. If your bonus stubs show
            different rates, type them here.
          </Trans>
        }
      >
        <SettingsRow
          title={t('Federal on bonuses')}
          description={t('Usual: 22%')}
          control={
            <NumberField
              label={t('Federal on bonuses')}
              suffix="%"
              value={tax.bonusFederalPercent ?? 0}
              onChange={bonusFederalPercent => update({ bonusFederalPercent })}
              width={70}
            />
          }
        />
        {hasStateTax && (
          <SettingsRow
            title={t('State on bonuses')}
            description={t('Usual for {{name}}: {{rate}}%', {
              name: state.name,
              rate: Number(
                (stateSupplementalRate(tax, state) * 100).toFixed(2),
              ),
            })}
            control={
              <NumberField
                label={t('State on bonuses')}
                suffix="%"
                value={tax.bonusStatePercent ?? 0}
                onChange={bonusStatePercent => update({ bonusStatePercent })}
                width={70}
              />
            }
          />
        )}
      </SettingsGroup>

      <SettingsGroup
        title={t('Other employee taxes')}
        description={
          <Trans>
            Any other tax on your pay stub, like state unemployment or
            disability. Add a yearly wage cap if it stops part way through the
            year.
          </Trans>
        }
      >
        {tax.otherTaxes.length === 0 && (
          <EmptyNote>
            <Trans>None.</Trans>
          </EmptyNote>
        )}
        {tax.otherTaxes.map(o => (
          <ItemRow key={o.id}>
            <Field label={t('Name')}>
              <TextField
                label={t('Name')}
                value={o.name}
                onChange={name => setOther(o.id, { name })}
                width={140}
              />
            </Field>
            <Field label={t('Rate')}>
              <NumberField
                label={t('Rate')}
                suffix="%"
                value={o.percent}
                onChange={percent => setOther(o.id, { percent })}
                width={70}
              />
            </Field>
            <Field label={t('Yearly wage cap')}>
              <NumberField
                label={t('Yearly wage cap')}
                prefix="$"
                value={o.wageCap ?? 0}
                onChange={cap =>
                  setOther(o.id, { wageCap: cap > 0 ? cap : null })
                }
              />
            </Field>
            <RemoveButton
              label={t('Remove {{name}}', { name: o.name })}
              onPress={() =>
                update({
                  otherTaxes: tax.otherTaxes.filter(x => x.id !== o.id),
                })
              }
            />
          </ItemRow>
        ))}
        <AddButton
          onPress={() =>
            update({
              otherTaxes: [
                ...tax.otherTaxes,
                {
                  id: newId(),
                  name: t('Other tax'),
                  percent: 0,
                  wageCap: null,
                },
              ],
            })
          }
        >
          <Trans>Add a tax</Trans>
        </AddButton>
      </SettingsGroup>

      <View style={{ height: spacing.md }} />
    </SettingsSections>
  );
}
