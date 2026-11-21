import type { RuleEntity } from '#types/models';

import {
  computeCheck,
  computeYear,
  defaultIncomeSettings,
  defaultTaxSettings,
  EMPTY_YTD,
  federalWithholding,
  hasFixedSplits,
  hoursKey,
  payDatesInYear,
  PER_DIEM_ID,
  rateOn,
  splitRuleCategories,
  stateWithholding,
  syncSplitRule,
  taxYearFor,
} from './paycheck';
import type { Deduction, IncomeSettings, TaxSettings } from './types';
import { stateFromZip } from './zip-to-state';

const year2026 = taxYearFor(2026);

function income(overrides: Partial<IncomeSettings> = {}): IncomeSettings {
  return {
    ...defaultIncomeSettings(),
    paydays: [
      { id: 'a', name: '1st', day: 1 },
      { id: 'b', name: '15th', day: 15 },
    ],
    rates: [{ from: '', rate: 100 }],
    hourLines: [
      { id: 'reg', name: 'Regular', hours: 40, multiplier: 1, checks: 'all' },
    ],
    ...overrides,
  };
}

function tax(overrides: Partial<TaxSettings> = {}): TaxSettings {
  return { ...defaultTaxSettings(), filingStatus: 'married', ...overrides };
}

describe('federal withholding (Pub 15-T 2026)', () => {
  it('uses the standard married table with the $12,900 adjustment', () => {
    // 4,000 x 24 = 96,000 - 12,900 = 83,100
    // 2,480 + 12% x (83,100 - 44,100) = 7,160 / 24 = 298.33
    expect(federalWithholding(4000, 24, tax(), year2026)).toBe(298.33);
  });

  it('takes off Step 3 credits and adds Step 4(c)', () => {
    const t = tax({
      w4: { ...defaultTaxSettings().w4, step3: 2400, step4c: 10 },
    });
    // 298.33 - 2,400 / 24 + 10
    expect(federalWithholding(4000, 24, t, year2026)).toBe(208.33);
  });

  it('uses the Step 2 checkbox table without the adjustment', () => {
    const t = tax({ w4: { ...defaultTaxSettings().w4, step2: true } });
    // 96,000: 5,800 + 22% x (96,000 - 66,500) = 12,290 / 24 = 512.08
    expect(federalWithholding(4000, 24, t, year2026)).toBe(512.08);
  });

  it('handles 2019-or-earlier forms with allowances', () => {
    const t = tax({
      w4: { ...defaultTaxSettings().w4, version: 'pre2020', allowances: 2 },
    });
    // 96,000 - 8,600 = 87,400: 2,480 + 12% x 43,300 = 7,676 / 24 = 319.83
    expect(federalWithholding(4000, 24, t, year2026)).toBe(319.83);
  });

  it('never goes below zero', () => {
    const t = tax({ w4: { ...defaultTaxSettings().w4, step3: 100000 } });
    expect(federalWithholding(1000, 24, t, year2026)).toBe(0);
  });
});

describe('state withholding', () => {
  it('flat state with a deduction, rounded to whole dollars', () => {
    const nc = year2026.states.NC;
    // (96,000 - 12,750) x 4.09% / 24 = 141.87 -> 142
    expect(stateWithholding(4000, 24, tax(), nc)).toBe(142);
  });

  it('no-tax state', () => {
    expect(stateWithholding(4000, 24, tax(), year2026.states.TX)).toBe(0);
  });

  it('finds the state from a ZIP', () => {
    expect(stateFromZip('28202')).toBe('NC');
    expect(stateFromZip('90210')).toBe('CA');
    expect(stateFromZip('10001')).toBe('NY');
    expect(stateFromZip('20500')).toBe('DC');
    expect(stateFromZip('12')).toBe(null);
  });
});

describe('one check', () => {
  const deductions: Deduction[] = [
    {
      id: 'k',
      name: '401(k)',
      kind: 'retirement',
      mode: 'percent',
      value: 5,
      checks: 'all',
    },
    {
      id: 'h',
      name: 'Health',
      kind: 'section125',
      mode: 'amount',
      value: 100,
      checks: 'all',
    },
    {
      id: 'u',
      name: 'Union',
      kind: 'posttax',
      mode: 'percent',
      value: 1.5,
      checks: 'all',
    },
  ];

  it('applies each deduction to the right wages', () => {
    const r = computeCheck({
      date: '2026-03-01',
      paydayId: 'a',
      income: income(),
      tax: tax({ state: 'TX' }),
      deductions,
      ytd: EMPTY_YTD,
    });
    expect(r.gross).toBe(4000);
    // Health lowers Social Security wages; 401(k) does not.
    expect(r.ssWages).toBe(3900);
    expect(r.taxableWages).toBe(3700);
    expect(r.taxes.socialSecurity).toBe(241.8);
    expect(r.taxes.medicare).toBe(56.55);
    expect(r.taxes.state).toBe(0);
    expect(r.posttaxTotal).toBe(60);
    expect(r.net).toBe(
      Number((4000 - r.pretaxTotal - r.taxTotal - r.posttaxTotal).toFixed(2)),
    );
  });

  it('rounds percent deductions up to the cent', () => {
    const r = computeCheck({
      date: '2026-03-01',
      paydayId: 'a',
      income: income({ rates: [{ from: '', rate: 100.0003 }] }),
      tax: tax({ state: 'TX' }),
      deductions: [deductions[0]],
      ytd: EMPTY_YTD,
    });
    // 4,000.01 x 5% = 200.0005 -> 200.01
    expect(r.pretax[0].amount).toBe(200.01);
  });

  it('only puts lines on the checks they belong to', () => {
    const inc = income({
      hourLines: [
        { id: 'reg', name: 'Regular', hours: 40, multiplier: 1, checks: 'all' },
        {
          id: 'ot',
          name: 'Overtime',
          hours: 10,
          multiplier: 1.5,
          checks: ['b'],
        },
      ],
    });
    const a = computeCheck({
      date: '2026-03-01',
      paydayId: 'a',
      income: inc,
      tax: tax({ state: 'TX' }),
      deductions: [],
      ytd: EMPTY_YTD,
    });
    const b = computeCheck({
      date: '2026-03-15',
      paydayId: 'b',
      income: inc,
      tax: tax({ state: 'TX' }),
      deductions: [],
      ytd: EMPTY_YTD,
    });
    expect(a.gross).toBe(4000);
    expect(b.gross).toBe(5500);
  });

  it('withholds extra pay at the flat 22% rate', () => {
    const plain = computeCheck({
      date: '2026-03-01',
      paydayId: 'a',
      income: income(),
      tax: tax({ state: 'TX' }),
      deductions: [],
      ytd: EMPTY_YTD,
    });
    const bonus = computeCheck({
      date: '2026-03-01',
      paydayId: 'a',
      income: income(),
      tax: tax({ state: 'TX' }),
      deductions: [],
      record: { extraPay: 1000 },
      ytd: EMPTY_YTD,
    });
    expect(bonus.gross).toBe(5000);
    expect(bonus.taxes.federal).toBeCloseTo(plain.taxes.federal + 220, 2);
  });

  it('uses real stub numbers when given', () => {
    const r = computeCheck({
      date: '2026-03-01',
      paydayId: 'a',
      income: income(),
      tax: tax({ state: 'TX' }),
      deductions: [],
      record: { actual: { gross: 4100, net: 3000, federal: 400 } },
      ytd: EMPTY_YTD,
    });
    expect(r.status).toBe('actual');
    expect(r.gross).toBe(4100);
    expect(r.net).toBe(3000);
    expect(r.taxes.federal).toBe(400);
  });

  it('adds the extra Medicare rate past $200,000 for the year', () => {
    const r = computeCheck({
      date: '2026-11-01',
      paydayId: 'a',
      income: income(),
      tax: tax({ state: 'TX' }),
      deductions: [],
      ytd: { ...EMPTY_YTD, medicareWages: 198000 },
    });
    // 4,000 x 1.45% + 2,000 x 0.9%
    expect(r.taxes.medicare).toBe(58 + 18);
  });

  it('stops other taxes at their wage cap', () => {
    const r = computeCheck({
      date: '2026-11-01',
      paydayId: 'a',
      income: income(),
      tax: tax({
        state: 'TX',
        otherTaxes: [{ id: 'x', name: 'Other', percent: 1, wageCap: 10000 }],
      }),
      deductions: [],
      ytd: { ...EMPTY_YTD, gross: 8000 },
    });
    expect(r.taxes.other[0].amount).toBe(20);
  });
});

describe('a whole year', () => {
  const big = income({ rates: [{ from: '', rate: 250 }] });
  const config = {
    income: big,
    tax: tax({ state: 'TX' }),
    deductions: [],
    history: {},
  };

  it('stops Social Security at the wage base and lands on the exact max', () => {
    const checks = computeYear(2026, config);
    expect(checks).toHaveLength(24);
    const total = checks.reduce((s, c) => s + c.taxes.socialSecurity, 0);
    expect(Number(total.toFixed(2))).toBe(11439);
    expect(checks[checks.length - 1].taxes.socialSecurity).toBe(0);
  });

  it('starts over in January', () => {
    const next = computeYear(2027, config);
    expect(next[0].taxes.socialSecurity).toBe(620);
    expect(next[0].ytd.gross).toBe(10000);
  });

  it('continues from a pay stub starting point', () => {
    const checks = computeYear(2026, {
      ...config,
      history: {
        '2026': {
          start: {
            date: '2026-06-15',
            gross: 120000,
            ssWages: 184500,
            medicareWages: 120000,
          },
          checks: {},
        },
      },
    });
    const july = checks.find(c => c.date === '2026-07-01');
    expect(july?.taxes.socialSecurity).toBe(0);
    expect(july?.ytd.gross).toBe(130000);
  });
});

describe('net split by line', () => {
  const inc = income({
    hourLines: [
      { id: 'reg', name: 'Regular', hours: 40, multiplier: 1, checks: 'all' },
      { id: 'ot', name: 'Overtime', hours: 20, multiplier: 1.5, checks: ['b'] },
    ],
  });
  const config = {
    income: inc,
    tax: tax({ state: 'NC' }),
    deductions: [
      {
        id: 'h',
        name: 'Health',
        kind: 'section125' as const,
        mode: 'amount' as const,
        value: 100,
        checks: 'all' as const,
      },
    ],
    history: {},
  };

  it('adds up to the check net, with base matching a base-only check', () => {
    const [a, b] = computeYear(2026, config);
    const sum = b.netSplit.reduce((s, l) => s + l.amount, 0);
    expect(Number(sum.toFixed(2))).toBe(b.net);
    expect(b.netSplit.map(l => l.id)).toEqual(['reg', 'ot']);
    expect(b.netSplit[0].amount).toBe(a.net);
    expect(a.netSplit).toEqual([{ id: 'reg', name: 'Regular', amount: a.net }]);
  });

  it('puts a bonus in its own line', () => {
    const checks = computeYear(2026, {
      ...config,
      history: { '2026': { checks: { '2026-01-01': { extraPay: 500 } } } },
    });
    const split = checks[0].netSplit;
    expect(split[split.length - 1].id).toBe('extra');
    const sum = split.reduce((s, l) => s + l.amount, 0);
    expect(Number(sum.toFixed(2))).toBe(checks[0].net);
  });
});

describe('month values from the top bar', () => {
  const config = {
    income: income(),
    tax: tax({ state: 'TX' }),
    deductions: [],
    history: {},
  };

  it('uses typed hours for that month only', () => {
    const checks = computeYear(2026, {
      ...config,
      history: {
        '2026': {
          checks: {},
          months: { '2026-03': { hours: { [hoursKey('reg', 'a')]: 30 } } },
        },
      },
    });
    const march1 = checks.find(c => c.date === '2026-03-01');
    const march15 = checks.find(c => c.date === '2026-03-15');
    const april1 = checks.find(c => c.date === '2026-04-01');
    expect(march1?.gross).toBe(3000);
    expect(march15?.gross).toBe(4000);
    expect(april1?.gross).toBe(4000);
  });

  it('carries a rate forward into later months and years', () => {
    const history = {
      '2026': { checks: {}, months: { '2026-06': { rate: 110 } } },
    };
    const y2026 = computeYear(2026, { ...config, history });
    expect(y2026.find(c => c.date === '2026-05-15')?.gross).toBe(4000);
    expect(y2026.find(c => c.date === '2026-06-01')?.gross).toBe(4400);
    expect(y2026.find(c => c.date === '2026-12-15')?.gross).toBe(4400);
    expect(computeYear(2027, { ...config, history })[0].gross).toBe(4400);
  });

  it('feeds typed hours into year-to-date for Social Security', () => {
    const big = computeYear(2026, {
      ...config,
      history: {
        '2026': {
          checks: {},
          months: { '2026-01': { hours: { [hoursKey('reg', 'a')]: 2000 } } },
        },
      },
    });
    // 2,000 x 100 = 200,000 in the first check: over the wage base, so
    // every later check pays no Social Security.
    expect(big[0].taxes.socialSecurity).toBe(11439);
    expect(big[1].taxes.socialSecurity).toBe(0);
  });
});

describe('per diem', () => {
  const perDiem = {
    enabled: true,
    rate: 2.5,
    hours: 100,
    checks: ['b'] as string[],
    taxed: false,
  };

  it('adds untaxed per diem to net pay only', () => {
    const plain = computeYear(2026, {
      income: income(),
      tax: tax({ state: 'TX' }),
      deductions: [],
      history: {},
    })[1];
    const withPd = computeYear(2026, {
      income: income({ perDiem }),
      tax: tax({ state: 'TX' }),
      deductions: [],
      history: {},
    })[1];
    expect(withPd.perDiem).toBe(250);
    expect(withPd.gross).toBe(plain.gross);
    expect(withPd.taxTotal).toBe(plain.taxTotal);
    expect(withPd.net).toBe(Number((plain.net + 250).toFixed(2)));
    expect(withPd.netSplit.map(l => l.id)).toEqual(['reg', PER_DIEM_ID]);
    expect(withPd.netSplit[1].amount).toBe(250);
  });

  it('adds taxed per diem to gross pay', () => {
    const r = computeYear(2026, {
      income: income({ perDiem: { ...perDiem, taxed: true } }),
      tax: tax({ state: 'TX' }),
      deductions: [],
      history: {},
    })[1];
    expect(r.perDiem).toBe(0);
    expect(r.gross).toBe(4250);
    expect(r.hourPay.map(l => l.id)).toEqual(['reg', PER_DIEM_ID]);
  });

  it('uses typed per diem hours and the carried rate', () => {
    const r = computeYear(2026, {
      income: income({ perDiem }),
      tax: tax({ state: 'TX' }),
      deductions: [],
      history: {
        '2026': {
          checks: {},
          months: {
            '2026-01': {
              perDiemRate: 3,
              hours: { [hoursKey(PER_DIEM_ID, 'b')]: 50 },
            },
          },
        },
      },
    });
    expect(r[1].perDiem).toBe(150);
    expect(r[3].perDiem).toBe(300);
  });

  it('names a bonus "Bonus" in the split', () => {
    const r = computeYear(2026, {
      income: income(),
      tax: tax({ state: 'TX' }),
      deductions: [],
      history: { '2026': { checks: { '2026-01-01': { extraPay: 1000 } } } },
    })[0];
    expect(r.netSplit[r.netSplit.length - 1]).toMatchObject({
      id: 'extra',
      name: 'Bonus',
    });
  });
});

describe('pay dates', () => {
  it('twice a month uses the chosen days, clamped to month length', () => {
    const dates = payDatesInYear(
      income({
        paydays: [
          { id: 'a', name: '15th', day: 15 },
          { id: 'b', name: 'Last', day: 31 },
        ],
      }),
      2026,
    );
    expect(dates).toHaveLength(24);
    expect(dates[3].date).toBe('2026-02-28');
  });

  it('every two weeks from a first pay date', () => {
    const dates = payDatesInYear(
      income({ frequency: 'biweekly', firstPayDate: '2025-12-26' }),
      2026,
    );
    expect(dates[0].date).toBe('2026-01-09');
    expect(dates).toHaveLength(26);
  });

  it('picks the hourly rate in effect on the pay date', () => {
    const inc = income({
      rates: [
        { from: '', rate: 50 },
        { from: '2026-07-01', rate: 55 },
      ],
    });
    expect(rateOn(inc, '2026-06-15')).toBe(50);
    expect(rateOn(inc, '2026-07-01')).toBe(55);
  });
});

describe('bonus tax rates', () => {
  const run = (overrides: Partial<TaxSettings>) =>
    computeCheck({
      date: '2026-03-01',
      paydayId: 'a',
      income: income(),
      tax: tax({ state: 'NC', ...overrides }),
      deductions: [],
      record: { extraPay: 1000 },
      ytd: EMPTY_YTD,
    });

  it('uses 22% federal and the state bonus rate by default', () => {
    const plain = computeCheck({
      date: '2026-03-01',
      paydayId: 'a',
      income: income(),
      tax: tax({ state: 'NC' }),
      deductions: [],
      ytd: EMPTY_YTD,
    });
    const r = run({});
    expect(r.taxes.federal).toBeCloseTo(plain.taxes.federal + 220, 2);
    expect(r.taxes.state).toBeCloseTo(plain.taxes.state + 40.9, 2);
  });

  it('uses the rates typed in Settings', () => {
    const base = run({});
    const r = run({ bonusFederalPercent: 30, bonusStatePercent: 7 });
    expect(r.taxes.federal).toBeCloseTo(base.taxes.federal + 80, 2);
    expect(r.taxes.state).toBeCloseTo(base.taxes.state + 29.1, 2);
  });
});

describe('real stub numbers', () => {
  const deductions: Deduction[] = [
    {
      id: 'h',
      name: 'Health',
      kind: 'section125',
      mode: 'amount',
      value: 100,
      checks: 'all',
    },
    {
      id: 'u',
      name: 'Union',
      kind: 'posttax',
      mode: 'percent',
      value: 1.5,
      checks: 'all',
      onBonus: true,
    },
  ];

  it('uses stub deductions, other taxes, and per diem', () => {
    const r = computeCheck({
      date: '2026-03-01',
      paydayId: 'a',
      income: income(),
      tax: tax({ state: 'TX' }),
      deductions,
      record: {
        actual: {
          gross: 4020,
          net: 3100,
          taxedPerDiem: 20,
          perDiem: 50,
          deductions: { h: 90 },
          otherTaxes: { 'State unemployment': 2.5 },
        },
      },
      ytd: EMPTY_YTD,
    });
    expect(r.status).toBe('actual');
    expect(r.hourPay.map(l => l.amount)).toEqual([4000, 20]);
    expect(r.extraPay).toBe(0);
    expect(r.perDiem).toBe(50);
    expect(r.pretax[0].amount).toBe(90);
    // Social Security wages use the stub's health amount.
    expect(r.ssWages).toBe(3930);
    expect(r.taxes.other).toEqual([
      {
        id: 'actual-State unemployment',
        name: 'State unemployment',
        amount: 2.5,
      },
    ]);
    expect(r.net).toBe(3100);
  });

  it('takes a percent deduction from bonuses when asked', () => {
    const r = computeCheck({
      date: '2026-03-01',
      paydayId: 'a',
      income: income(),
      tax: tax({ state: 'TX' }),
      deductions,
      record: { extraPay: 1000 },
      ytd: EMPTY_YTD,
    });
    expect(r.posttax[0].amount).toBe(75);
  });

  it('puts a real check bonus on its own line in the split', () => {
    const checks = computeYear(2026, {
      income: income(),
      tax: tax({ state: 'TX' }),
      deductions: [],
      history: {
        '2026': {
          checks: { '2026-01-01': { actual: { gross: 5000, net: 3900 } } },
        },
      },
    });
    const split = checks[0].netSplit;
    expect(split.map(l => l.id)).toEqual(['reg', 'extra']);
    expect(Number(split.reduce((s, l) => s + l.amount, 0).toFixed(2))).toBe(
      3900,
    );
  });
});

describe('split leftovers', () => {
  it('skip lines with no pay', () => {
    const inc = income({
      hourLines: [
        { id: 'reg', name: 'Regular', hours: 40, multiplier: 1, checks: 'all' },
        { id: 'ot', name: 'Overtime', hours: 0, multiplier: 1, checks: 'all' },
      ],
    });
    const plain = computeYear(2026, {
      income: inc,
      tax: tax({ state: 'TX' }),
      deductions: [],
      history: {},
    })[0];
    const checks = computeYear(2026, {
      income: inc,
      tax: tax({ state: 'TX' }),
      deductions: [],
      history: {
        '2026': {
          checks: {
            '2026-01-01': {
              actual: { gross: 4000, net: Number((plain.net - 10).toFixed(2)) },
            },
          },
        },
      },
    });
    const split = checks[0].netSplit;
    expect(split.find(l => l.id === 'ot')?.amount).toBe(0);
    expect(split.find(l => l.id === 'reg')?.amount).toBe(
      Number((plain.net - 10).toFixed(2)),
    );
  });
});

describe('split rule sync', () => {
  const rule = {
    id: 'r',
    stage: null,
    conditionsOp: 'and',
    conditions: [],
    actions: [
      {
        op: 'set',
        field: 'category',
        value: 'base',
        options: { splitIndex: 1 },
      },
      {
        op: 'set-split-amount',
        value: 400000,
        options: { splitIndex: 1, method: 'fixed-amount' },
      },
      {
        op: 'set',
        field: 'category',
        value: 'extra',
        options: { splitIndex: 2 },
      },
      {
        op: 'set-split-amount',
        value: 300000,
        options: { splitIndex: 2, method: 'fixed-amount' },
      },
      {
        op: 'set',
        field: 'category',
        value: 'rest',
        options: { splitIndex: 3 },
      },
      {
        op: 'set-split-amount',
        value: null,
        options: { splitIndex: 3, method: 'remainder' },
      },
    ],
  } as unknown as RuleEntity;

  it('sets fixed amounts from the plan and leaves the rest alone', () => {
    const next = syncSplitRule(rule, { base: 4510.37, rest: 999 });
    expect(next?.actions[1]).toMatchObject({ value: 451037 });
    expect(next?.actions[3]).toMatchObject({ value: 300000 });
    expect(next?.actions[5]).toMatchObject({ value: null });
    expect(splitRuleCategories(rule)).toEqual(['base', 'extra', 'rest']);
    expect(hasFixedSplits(rule)).toBe(true);
  });

  it('returns null when nothing changes', () => {
    expect(syncSplitRule(rule, { base: 4000, extra: 3000 })).toBeNull();
  });
});

describe('per diem on real checks', () => {
  it('splits out the stub per diem, not the estimate', () => {
    const checks = computeYear(2026, {
      income: income({
        perDiem: {
          enabled: true,
          rate: 2,
          hours: 100,
          checks: 'all',
          taxed: false,
        },
      }),
      tax: tax({ state: 'TX' }),
      deductions: [],
      history: {
        '2026': {
          checks: {
            '2026-01-01': { actual: { gross: 4000, net: 3300, perDiem: 60 } },
          },
        },
      },
    });
    const split = checks[0].netSplit;
    expect(split.find(l => l.id === PER_DIEM_ID)?.amount).toBe(60);
    expect(Number(split.reduce((s, l) => s + l.amount, 0).toFixed(2))).toBe(
      3300,
    );
  });
});
