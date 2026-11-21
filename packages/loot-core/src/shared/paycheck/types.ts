// Types for the Income page and its settings (paycheck estimator).
// All money values are dollars (not cents). Percents are stored as the
// number people type: 1.85 means 1.85%.

export type FilingStatus =
  | 'single'
  | 'married'
  | 'marriedSeparate'
  | 'headOfHousehold';

export type PayFrequency = 'weekly' | 'biweekly' | 'semimonthly' | 'monthly';

export const PERIODS_PER_YEAR: Record<PayFrequency, number> = {
  weekly: 52,
  biweekly: 26,
  semimonthly: 24,
  monthly: 12,
};

// 'all' = every check. Otherwise a list of payday ids (twice-a-month and
// monthly schedules only).
export type CheckFilter = 'all' | string[];

export type Payday = { id: string; name: string; day: number };

export type RateChange = { from: string; rate: number };

export type HourLine = {
  id: string;
  name: string;
  hours: number;
  multiplier: number;
  checks: CheckFilter;
};

// Taxed but never paid to you (e.g. group life insurance over $50k).
export type ImputedLine = {
  id: string;
  name: string;
  amount: number;
  checks: CheckFilter;
};

export type IncomeSettings = {
  frequency: PayFrequency;
  paydays: Payday[];
  firstPayDate: string;
  rates: RateChange[];
  hourLines: HourLine[];
  imputed: ImputedLine[];
  otherMonthlyIncome: number;
  perDiem?: PerDiem;
  // Income category for each payday (or 'all' / 'other') used by the
  // Income page's "Put in budget" button.
  budgetCategories?: Record<string, string>;
};

export type W4 = {
  version: '2020' | 'pre2020';
  step2: boolean;
  step3: number;
  step4a: number;
  step4b: number;
  step4c: number;
  allowances: number;
};

export type OtherTax = {
  id: string;
  name: string;
  percent: number;
  wageCap: number | null;
};

export type TaxSettings = {
  zip: string;
  state: string | null;
  filingStatus: FilingStatus;
  w4: W4;
  stateAllowances: number;
  stateExtra: number;
  localPercent: number;
  otherTaxes: OtherTax[];
};

// retirement: 401(k)/403(b) — lowers federal/state wages only.
// section125: medical, dental, vision, HSA — lowers all taxed wages.
// posttax: taken after taxes.
export type DeductionKind = 'retirement' | 'section125' | 'posttax';

export type Deduction = {
  id: string;
  name: string;
  kind: DeductionKind;
  mode: 'percent' | 'amount';
  value: number;
  checks: CheckFilter;
};

export type DeductionSettings = { deductions: Deduction[] };

// What a real pay stub said. Only gross and net are needed; the rest are
// optional and shown in place of the estimate when filled in.
export type ActualCheck = {
  gross: number;
  net: number;
  federal?: number;
  state?: number;
  socialSecurity?: number;
  medicare?: number;
};

export type CheckRecord = {
  extraPay?: number;
  actual?: ActualCheck;
};

// Year-to-date numbers copied from a pay stub, so a year can start part
// way through.
export type YtdStart = {
  date: string;
  ssWages: number;
  medicareWages: number;
  gross: number;
};

// What was typed in the Income page's top bar for one month. The rate
// carries forward to later months; hours are for that month only. Hours are
// keyed by hoursKey(lineId, paydayId).
export type MonthEntry = {
  rate?: number;
  perDiemRate?: number;
  hours?: Record<string, number>;
};

// Per diem: paid per hour away from base. Not taxed unless `taxed` is on;
// then it's added to gross pay like other pay.
export type PerDiem = {
  enabled: boolean;
  rate: number;
  hours: number;
  checks: CheckFilter;
  taxed: boolean;
};

export type YearHistory = {
  start?: YtdStart;
  checks: Record<string, CheckRecord>;
  months?: Record<string, MonthEntry>;
};

export type IncomeHistory = Record<string, YearHistory>;

// ---- Tax tables ----

type ByStatus<T> = Record<FilingStatus, T>;
export type Bracket = [from: number, rate: number];

export type StateWithholding = {
  code: string;
  name: string;
  kind: 'none' | 'flat' | 'brackets';
  brackets?: ByStatus<Bracket[]>;
  standardDeduction?: ByStatus<number>;
  allowanceDeduction?: number;
  allowanceCredit?: number;
  personalCredit?: ByStatus<number>;
  roundToWholeDollar?: boolean;
  supplementalRate?: number;
  estimate?: boolean;
  note?: string;
  source: string;
};

// One row of an IRS annual percentage method table:
// [at least, base tax, rate]. The rate applies to wages over "at least".
export type FederalRow = [atLeast: number, base: number, rate: number];

export type FederalTables = {
  standard: Record<'married' | 'single' | 'headOfHousehold', FederalRow[]>;
  step2: Record<'married' | 'single' | 'headOfHousehold', FederalRow[]>;
  line1g: { married: number; other: number };
  allowance: number;
  supplementalRate: number;
  supplementalOverMillionRate: number;
  socialSecurityRate: number;
  socialSecurityWageBase: number;
  medicareRate: number;
  additionalMedicareRate: number;
  additionalMedicareThreshold: number;
};

export type TaxYear = {
  year: number;
  federal: FederalTables;
  states: Record<string, StateWithholding>;
};

// ---- Results ----

export type PaycheckLine = { id: string; name: string; amount: number };

export type PaycheckResult = {
  date: string;
  paydayId: string | null;
  status: 'estimated' | 'actual';
  hourPay: PaycheckLine[];
  extraPay: number;
  // Per diem paid on this check that is not taxed (added to net pay). Taxed
  // per diem is in hourPay instead.
  perDiem: number;
  gross: number;
  imputed: number;
  pretax: PaycheckLine[];
  pretaxTotal: number;
  ssWages: number;
  medicareWages: number;
  taxableWages: number;
  taxes: {
    federal: number;
    socialSecurity: number;
    medicare: number;
    state: number;
    local: number;
    other: PaycheckLine[];
  };
  taxTotal: number;
  posttax: PaycheckLine[];
  posttaxTotal: number;
  net: number;
  // Net pay split by hour line (filled in by computeYear).
  netSplit: PaycheckLine[];
  ytd: { gross: number; ssWages: number; medicareWages: number; net: number };
};
