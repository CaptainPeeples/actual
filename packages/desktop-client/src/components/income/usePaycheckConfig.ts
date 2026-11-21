// Custom branch: reads and saves the Income page settings. Each part is a
// synced preference holding JSON, so it follows the budget file to every
// device.
import { useMemo } from 'react';

import {
  defaultIncomeSettings,
  defaultTaxSettings,
} from '@actual-app/core/shared/paycheck/paycheck';
import type { PaycheckConfig } from '@actual-app/core/shared/paycheck/paycheck';
import type {
  Deduction,
  IncomeHistory,
  IncomeSettings,
  TaxSettings,
} from '@actual-app/core/shared/paycheck/types';

import { useSyncedPref } from '#hooks/useSyncedPref';

function parse<T>(raw: string | undefined, fallback: T): T {
  if (!raw) {
    return fallback;
  }
  try {
    const value: unknown = JSON.parse(raw);
    if (Array.isArray(fallback)) {
      return (Array.isArray(value) ? value : fallback) as T;
    }
    if (value && typeof value === 'object') {
      return { ...fallback, ...(value as object) };
    }
  } catch {
    // Bad JSON: fall back to defaults.
  }
  return fallback;
}

export function usePaycheckConfig() {
  const [incomeRaw, setIncomeRaw] = useSyncedPref('income-settings');
  const [taxRaw, setTaxRaw] = useSyncedPref('income-taxes');
  const [deductionsRaw, setDeductionsRaw] = useSyncedPref('income-deductions');
  const [historyRaw, setHistoryRaw] = useSyncedPref('income-history');

  const income = useMemo(
    () => parse<IncomeSettings>(incomeRaw, defaultIncomeSettings()),
    [incomeRaw],
  );
  const tax = useMemo(() => {
    const parsed = parse<TaxSettings>(taxRaw, defaultTaxSettings());
    return { ...parsed, w4: { ...defaultTaxSettings().w4, ...parsed.w4 } };
  }, [taxRaw]);
  const deductions = useMemo(
    () => parse<Deduction[]>(deductionsRaw, []),
    [deductionsRaw],
  );
  const history = useMemo(
    () => parse<IncomeHistory>(historyRaw, {}),
    [historyRaw],
  );

  const config: PaycheckConfig = useMemo(
    () => ({ income, tax, deductions, history }),
    [income, tax, deductions, history],
  );

  return {
    config,
    income,
    tax,
    deductions,
    history,
    // Set up once the user has entered a pay rate.
    isSetUp: income.rates.some(r => r.rate > 0),
    setIncome: (value: IncomeSettings) => setIncomeRaw(JSON.stringify(value)),
    setTax: (value: TaxSettings) => setTaxRaw(JSON.stringify(value)),
    setDeductions: (value: Deduction[]) =>
      setDeductionsRaw(JSON.stringify(value)),
    setHistory: (value: IncomeHistory) => setHistoryRaw(JSON.stringify(value)),
  };
}
