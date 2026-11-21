import {
  computeCheck,
  computeYear,
  defaultIncomeSettings,
  defaultTaxSettings,
  EMPTY_YTD,
  federalWithholding,
  payDatesInYear,
  rateOn,
  stateWithholding,
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
