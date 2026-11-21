// Paycheck estimator for the Income page. Figures each check the way
// payroll does: federal (IRS Pub 15-T percentage method), Social Security
// and Medicare with yearly caps, state withholding, local, and other
// employee taxes. Year-to-date totals come from the year's checks in order,
// so caps reset on the first check of each year (by pay date).
import { FEDERAL_2026 } from './federal-2026';
import { STATE_WITHHOLDING_2026 } from './states-2026';
import { PERIODS_PER_YEAR } from './types';
import type {
  Bracket,
  CheckFilter,
  CheckRecord,
  Deduction,
  FederalRow,
  HourLine,
  IncomeHistory,
  IncomeSettings,
  MonthEntry,
  PaycheckLine,
  PaycheckResult,
  StateWithholding,
  TaxSettings,
  TaxYear,
  YearHistory,
} from './types';
import { stateFromZip } from './zip-to-state';

const TAX_YEARS: Record<number, TaxYear> = {
  2026: { year: 2026, federal: FEDERAL_2026, states: STATE_WITHHOLDING_2026 },
};

// Tax tables for a year. Uses the newest tables on or before that year (or
// the oldest if the year is earlier than all of them).
export function taxYearFor(year: number): TaxYear {
  const years = Object.keys(TAX_YEARS)
    .map(Number)
    .sort((a, b) => a - b);
  let pick = years[0];
  for (const y of years) {
    if (y <= year) {
      pick = y;
    }
  }
  return TAX_YEARS[pick];
}

export function hasTaxTablesFor(year: number): boolean {
  return year in TAX_YEARS;
}

export function cents(value: number): number {
  return Math.round(Number((value * 100).toFixed(6))) / 100;
}

function centsUp(value: number): number {
  return Math.ceil(Number((value * 100).toFixed(6))) / 100;
}

function sum(values: number[]): number {
  return cents(values.reduce((a, b) => a + b, 0));
}

// ---- Defaults (generic, no real data) ----

export function defaultIncomeSettings(): IncomeSettings {
  return {
    frequency: 'semimonthly',
    paydays: [
      { id: 'payday-1', name: '1st', day: 1 },
      { id: 'payday-2', name: '15th', day: 15 },
    ],
    firstPayDate: '',
    rates: [{ from: '', rate: 0 }],
    hourLines: [
      {
        id: 'regular',
        name: 'Regular',
        hours: 0,
        multiplier: 1,
        checks: 'all',
      },
    ],
    imputed: [],
    otherMonthlyIncome: 0,
  };
}

export function defaultTaxSettings(): TaxSettings {
  return {
    zip: '',
    state: null,
    filingStatus: 'single',
    w4: {
      version: '2020',
      step2: false,
      step3: 0,
      step4a: 0,
      step4b: 0,
      step4c: 0,
      allowances: 0,
    },
    stateAllowances: 0,
    stateExtra: 0,
    localPercent: 0,
    otherTaxes: [],
  };
}

// ---- Pay dates ----

export type PayDate = { date: string; paydayId: string | null };

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function toIso(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(
    d.getUTCDate(),
  )}`;
}

function fromIso(date: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || '');
  if (!m) {
    return null;
  }
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

export function periodsPerYear(income: IncomeSettings): number {
  if (income.frequency === 'semimonthly' || income.frequency === 'monthly') {
    return Math.max(1, income.paydays.length) * 12;
  }
  return PERIODS_PER_YEAR[income.frequency];
}

export function payDatesInYear(
  income: IncomeSettings,
  year: number,
): PayDate[] {
  const out: PayDate[] = [];
  if (income.frequency === 'semimonthly' || income.frequency === 'monthly') {
    for (let month = 1; month <= 12; month++) {
      const last = daysInMonth(year, month);
      for (const p of income.paydays) {
        const day = Math.min(Math.max(1, Math.round(p.day) || 1), last);
        out.push({
          date: `${year}-${pad(month)}-${pad(day)}`,
          paydayId: p.id,
        });
      }
    }
  } else {
    const anchor = fromIso(income.firstPayDate);
    if (!anchor) {
      return [];
    }
    const stepMs = (income.frequency === 'weekly' ? 7 : 14) * 86_400_000;
    const start = Date.UTC(year, 0, 1);
    const end = Date.UTC(year + 1, 0, 1);
    const first =
      anchor.getTime() +
      Math.ceil((start - anchor.getTime()) / stepMs) * stepMs;
    for (let t = first; t < end; t += stepMs) {
      out.push({ date: toIso(new Date(t)), paydayId: null });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

function applies(filter: CheckFilter, paydayId: string | null): boolean {
  if (filter === 'all') {
    return true;
  }
  return paydayId != null && filter.includes(paydayId);
}

export function rateOn(income: IncomeSettings, date: string): number {
  const sorted = [...income.rates].sort((a, b) =>
    (a.from || '').localeCompare(b.from || ''),
  );
  let rate = sorted[0]?.rate ?? 0;
  for (const r of sorted) {
    if ((r.from || '') <= date) {
      rate = r.rate;
    }
  }
  return rate;
}

// ---- Taxes ----

function tableRow(rows: FederalRow[], amount: number): FederalRow {
  let row = rows[0];
  for (const r of rows) {
    if (amount >= r[0]) {
      row = r;
    }
  }
  return row;
}

// Pub 15-T Worksheet 1A for one pay period's taxable wages.
export function federalWithholding(
  wages: number,
  periods: number,
  tax: TaxSettings,
  year: TaxYear,
): number {
  const fed = year.federal;
  const w4 = tax.w4;
  const key =
    tax.filingStatus === 'married'
      ? 'married'
      : tax.filingStatus === 'headOfHousehold'
        ? 'headOfHousehold'
        : 'single';

  let annual = wages * periods;
  let rows: FederalRow[];
  let credits = 0;

  if (w4.version === 'pre2020') {
    annual -= (w4.allowances || 0) * fed.allowance;
    rows = fed.standard[key === 'headOfHousehold' ? 'single' : key];
  } else {
    annual += w4.step4a || 0;
    annual -= w4.step4b || 0;
    if (!w4.step2) {
      annual -= key === 'married' ? fed.line1g.married : fed.line1g.other;
    }
    rows = w4.step2 ? fed.step2[key] : fed.standard[key];
    credits = w4.step3 || 0;
  }
  annual = Math.max(0, annual);

  const [atLeast, base, rate] = tableRow(rows, annual);
  const tentative = (base + (annual - atLeast) * rate) / periods;
  return cents(Math.max(0, tentative - credits / periods) + (w4.step4c || 0));
}

function progressive(amount: number, brackets: Bracket[]): number {
  let total = 0;
  for (let i = 0; i < brackets.length; i++) {
    const [from, rate] = brackets[i];
    const to = i + 1 < brackets.length ? brackets[i + 1][0] : Infinity;
    if (amount > from) {
      total += (Math.min(amount, to) - from) * rate;
    }
  }
  return total;
}

export function resolveState(tax: TaxSettings): string | null {
  return tax.state || stateFromZip(tax.zip);
}

export function stateInfo(
  tax: TaxSettings,
  year: TaxYear,
): StateWithholding | null {
  const code = resolveState(tax);
  return code ? (year.states[code] ?? null) : null;
}

export function stateWithholding(
  wages: number,
  periods: number,
  tax: TaxSettings,
  state: StateWithholding | null,
): number {
  if (!state || state.kind === 'none' || !state.brackets) {
    return 0;
  }
  const status = tax.filingStatus;
  const allowances = tax.stateAllowances || 0;
  const annual = Math.max(
    0,
    wages * periods -
      (state.standardDeduction?.[status] ?? 0) -
      allowances * (state.allowanceDeduction ?? 0),
  );

  let yearly = progressive(annual, state.brackets[status]);
  yearly -= state.personalCredit?.[status] ?? 0;
  yearly -= allowances * (state.allowanceCredit ?? 0);

  const perCheck = Math.max(0, yearly) / periods;
  return state.roundToWholeDollar ? Math.round(perCheck) : cents(perCheck);
}

function stateSupplementalRate(
  tax: TaxSettings,
  state: StateWithholding | null,
): number {
  if (!state || state.kind === 'none' || !state.brackets) {
    return 0;
  }
  if (state.supplementalRate != null) {
    return state.supplementalRate;
  }
  const rows = state.brackets[tax.filingStatus];
  return rows.length ? rows[rows.length - 1][1] : 0;
}

// ---- One check ----

export type Ytd = {
  gross: number;
  ssWages: number;
  medicareWages: number;
  net: number;
};

export const EMPTY_YTD: Ytd = {
  gross: 0,
  ssWages: 0,
  medicareWages: 0,
  net: 0,
};

export type CheckInput = {
  date: string;
  paydayId: string | null;
  income: IncomeSettings;
  tax: TaxSettings;
  deductions: Deduction[];
  record?: CheckRecord;
  ytd: Ytd;
};

export function computeCheck(input: CheckInput): PaycheckResult {
  const { date, paydayId, income, tax, deductions, record, ytd } = input;
  const year = taxYearFor(Number(date.slice(0, 4)));
  const fed = year.federal;
  const periods = periodsPerYear(income);
  const rate = rateOn(income, date);
  const actual = record?.actual;

  const hourPay: PaycheckLine[] = income.hourLines
    .filter(l => applies(l.checks, paydayId))
    .map(l => ({
      id: l.id,
      name: l.name,
      amount: cents((l.hours || 0) * rate * (l.multiplier || 1)),
    }));
  const hourTotal = sum(hourPay.map(l => l.amount));

  // Per diem: taxed per diem is added to gross pay (as its own pay line);
  // untaxed per diem is added to net pay after taxes.
  const pd = income.perDiem;
  const perDiemAmount =
    pd?.enabled && applies(pd.checks, paydayId)
      ? cents((pd.hours || 0) * (pd.rate || 0))
      : 0;
  const perDiemTaxed = pd?.taxed ? perDiemAmount : 0;
  const perDiem = pd?.taxed ? 0 : perDiemAmount;
  if (pd?.enabled && pd.taxed && applies(pd.checks, paydayId)) {
    hourPay.push({ id: PER_DIEM_ID, name: 'Per diem', amount: perDiemTaxed });
  }

  const extraPay = actual
    ? cents(actual.gross - hourTotal - perDiemTaxed)
    : cents(record?.extraPay ?? 0);
  const gross = cents(hourTotal + perDiemTaxed + extraPay);
  // Extra pay (bonuses) is withheld at the flat supplemental rate. A
  // negative difference (fewer hours than usual) just lowers regular pay.
  const supplemental = Math.max(0, extraPay);

  const imputed = sum(
    income.imputed.filter(l => applies(l.checks, paydayId)).map(l => l.amount),
  );

  // Percent deductions are figured on hourly pay and rounded up to the
  // cent, like most payroll systems.
  const own = deductions.filter(d => applies(d.checks, paydayId));
  const amountOf = (d: Deduction) =>
    d.mode === 'percent'
      ? centsUp(((d.value || 0) / 100) * hourTotal)
      : cents(d.value || 0);
  const pretaxAll = own
    .filter(d => d.kind !== 'posttax')
    .map(d => ({
      id: d.id,
      name: d.name,
      kind: d.kind,
      amount: amountOf(d),
    }));
  const posttax: PaycheckLine[] = own
    .filter(d => d.kind === 'posttax')
    .map(d => ({ id: d.id, name: d.name, amount: amountOf(d) }));

  const section125 = sum(
    pretaxAll.filter(d => d.kind === 'section125').map(d => d.amount),
  );
  const retirement = sum(
    pretaxAll.filter(d => d.kind === 'retirement').map(d => d.amount),
  );

  const ssWages = Math.max(0, cents(gross + imputed - section125));
  const medicareWages = ssWages;
  const taxableWages = Math.max(0, cents(ssWages - retirement));
  const regularWages = Math.max(0, cents(taxableWages - supplemental));

  // Federal
  const supplementalFedRate =
    ytd.gross + gross > 1_000_000
      ? fed.supplementalOverMillionRate
      : fed.supplementalRate;
  let federal =
    federalWithholding(regularWages, periods, tax, year) +
    cents(supplemental * supplementalFedRate);

  // Social Security, up to the yearly wage base. Figured on year-to-date
  // wages so the year adds up to exactly the yearly max.
  const base = fed.socialSecurityWageBase;
  const ssBefore = Math.min(base, ytd.ssWages);
  const ssAfter = Math.min(base, ytd.ssWages + ssWages);
  let socialSecurity = cents(
    cents(ssAfter * fed.socialSecurityRate) -
      cents(ssBefore * fed.socialSecurityRate),
  );

  // Medicare, plus the extra rate on wages over the threshold this year
  const overStart = Math.max(
    ytd.medicareWages,
    fed.additionalMedicareThreshold,
  );
  const overAmount = Math.max(0, ytd.medicareWages + medicareWages - overStart);
  let medicare =
    cents(medicareWages * fed.medicareRate) +
    cents(overAmount * fed.additionalMedicareRate);

  // State
  const state = stateInfo(tax, year);
  let stateTax =
    stateWithholding(regularWages, periods, tax, state) +
    cents(supplemental * stateSupplementalRate(tax, state)) +
    (state && state.kind !== 'none' ? tax.stateExtra || 0 : 0);

  const local = cents(((tax.localPercent || 0) / 100) * taxableWages);

  const other: PaycheckLine[] = tax.otherTaxes.map(t => {
    const room =
      t.wageCap != null ? Math.max(0, t.wageCap - ytd.gross) : Infinity;
    return {
      id: t.id,
      name: t.name,
      amount: cents(Math.min(gross, room) * ((t.percent || 0) / 100)),
    };
  });

  if (actual) {
    federal = actual.federal ?? federal;
    socialSecurity = actual.socialSecurity ?? socialSecurity;
    medicare = actual.medicare ?? medicare;
    stateTax = actual.state ?? stateTax;
  }
  federal = cents(federal);
  medicare = cents(medicare);
  stateTax = cents(stateTax);

  const taxTotal = sum([
    federal,
    socialSecurity,
    medicare,
    stateTax,
    local,
    ...other.map(o => o.amount),
  ]);
  const pretax: PaycheckLine[] = pretaxAll.map(({ id, name, amount }) => ({
    id,
    name,
    amount,
  }));
  const pretaxTotal = sum(pretax.map(p => p.amount));
  const posttaxTotal = sum(posttax.map(p => p.amount));
  const net = actual
    ? cents(actual.net)
    : cents(gross - pretaxTotal - taxTotal - posttaxTotal + perDiem);

  return {
    date,
    paydayId,
    status: actual ? 'actual' : 'estimated',
    hourPay,
    extraPay,
    perDiem,
    gross,
    imputed,
    pretax,
    pretaxTotal,
    ssWages,
    medicareWages,
    taxableWages,
    taxes: {
      federal,
      socialSecurity,
      medicare,
      state: stateTax,
      local,
      other,
    },
    taxTotal,
    posttax,
    posttaxTotal,
    net,
    netSplit: [],
    ytd: {
      gross: cents(ytd.gross + gross),
      ssWages: cents(ytd.ssWages + ssWages),
      medicareWages: cents(ytd.medicareWages + medicareWages),
      net: cents(ytd.net + net),
    },
  };
}

// ---- A whole year ----

export type PaycheckConfig = {
  income: IncomeSettings;
  tax: TaxSettings;
  deductions: Deduction[];
  history: IncomeHistory;
};

// ---- Month-by-month values from the Income page's top bar ----

export const PER_DIEM_ID = 'per-diem';

// Key for one hours box: a pay line on one payday ('all' for schedules
// without named paydays).
export function hoursKey(lineId: string, paydayId: string | null): string {
  return `${lineId}:${paydayId ?? 'all'}`;
}

export function monthEntry(
  history: IncomeHistory,
  month: string,
): MonthEntry | undefined {
  return history[month.slice(0, 4)]?.months?.[month];
}

// The newest value typed on or before this month (any year), so a raise
// carries forward until it's changed again.
export function carriedValue(
  history: IncomeHistory,
  month: string,
  pick: (entry: MonthEntry) => number | undefined,
): number | undefined {
  let found: number | undefined;
  let foundMonth = '';
  for (const year of Object.values(history)) {
    for (const [m, entry] of Object.entries(year.months ?? {})) {
      const value = pick(entry);
      if (value != null && m <= month && m >= foundMonth) {
        found = value;
        foundMonth = m;
      }
    }
  }
  return found;
}

// Income settings for one check, with that month's typed rate and hours
// in place of the Settings defaults.
export function incomeForCheck(
  income: IncomeSettings,
  history: IncomeHistory,
  date: string,
  paydayId: string | null,
): IncomeSettings {
  const month = date.slice(0, 7);
  const entry = monthEntry(history, month);
  const hours = (id: string, fallback: number) =>
    entry?.hours?.[hoursKey(id, paydayId)] ?? fallback;
  const rate = carriedValue(history, month, e => e.rate) ?? rateOn(income, date);
  const pd = income.perDiem;
  return {
    ...income,
    rates: [{ from: '', rate }],
    hourLines: income.hourLines.map(l => ({ ...l, hours: hours(l.id, l.hours) })),
    perDiem: pd
      ? {
          ...pd,
          rate: carriedValue(history, month, e => e.perDiemRate) ?? pd.rate,
          hours: hours(PER_DIEM_ID, pd.hours),
        }
      : undefined,
  };
}

// ---- A whole year ----

// Every check in a year, in pay-date order, each using the year-to-date
// totals of the checks before it. If the year has a starting point from a
// pay stub, checks after that date continue from it.
export function computeYear(
  year: number,
  config: PaycheckConfig,
): PaycheckResult[] {
  const { income, tax, deductions, history } = config;
  const hist: YearHistory = history[String(year)] ?? { checks: {} };
  const start = hist.start;

  let before: Ytd = { ...EMPTY_YTD };
  let after: Ytd = start
    ? {
        gross: start.gross || 0,
        ssWages: start.ssWages || 0,
        medicareWages: start.medicareWages || 0,
        net: 0,
      }
    : { ...EMPTY_YTD };

  return payDatesInYear(income, year).map(({ date, paydayId }) => {
    const covered = start != null && date <= start.date;
    const input: CheckInput = {
      date,
      paydayId,
      income: incomeForCheck(income, history, date, paydayId),
      tax,
      deductions,
      record: hist.checks?.[date],
      ytd: covered ? before : after,
    };
    const result = computeCheck(input);
    result.netSplit = netByLine(input, result.net);
    if (covered) {
      before = result.ytd;
    } else {
      after = result.ytd;
    }
    return result;
  });
}

// Splits a check's net pay by pay line, in the order the lines are listed.
// The first line gets the net that check would have with only that line;
// each later line gets what it adds on top. So base pay on a check with
// extra hours nets the same as a base-only check, and the extra hours carry
// the higher taxes. Per diem and bonuses come last, each on its own line.
export function netByLine(
  input: CheckInput,
  totalNet: number,
): PaycheckLine[] {
  const { income, paydayId, record } = input;
  const own = income.hourLines.filter(l => applies(l.checks, paydayId));
  const out: PaycheckLine[] = [];
  let previous = 0;
  const netWith = (lines: HourLine[], withPerDiem: boolean) =>
    computeCheck({
      ...input,
      income: {
        ...income,
        hourLines: lines,
        perDiem: withPerDiem ? income.perDiem : undefined,
      },
      record: undefined,
    }).net;

  own.forEach((line, i) => {
    const net = netWith(own.slice(0, i + 1), false);
    out.push({ id: line.id, name: line.name, amount: cents(net - previous) });
    previous = net;
  });

  const pd = income.perDiem;
  if (pd?.enabled && applies(pd.checks, paydayId)) {
    const net = netWith(own, true);
    out.push({
      id: PER_DIEM_ID,
      name: 'Per diem',
      amount: cents(net - previous),
    });
    previous = net;
  }

  const rest = cents(totalNet - previous);
  if (rest !== 0) {
    if (record?.extraPay || record?.actual || out.length === 0) {
      out.push({ id: 'extra', name: 'Bonus', amount: rest });
    } else {
      const last = out[out.length - 1];
      last.amount = cents(last.amount + rest);
    }
  }
  return out;
}

export function checksInMonth(
  month: string,
  config: PaycheckConfig,
): PaycheckResult[] {
  const year = Number(month.slice(0, 4));
  return computeYear(year, config).filter(c => c.date.startsWith(month));
}

export type YearTotals = {
  gross: number;
  pretax: number;
  taxes: number;
  posttax: number;
  net: number;
};

export function yearTotals(checks: PaycheckResult[]): YearTotals {
  return {
    gross: sum(checks.map(c => c.gross)),
    pretax: sum(checks.map(c => c.pretaxTotal)),
    taxes: sum(checks.map(c => c.taxTotal)),
    posttax: sum(checks.map(c => c.posttaxTotal)),
    net: sum(checks.map(c => c.net)),
  };
}
