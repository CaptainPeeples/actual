import { paidBillCategories } from './ProjectedEndOfMonth';

const month = '2026-11';

describe('paidBillCategories', () => {
  it('counts a bill category as paid once its schedule is linked', () => {
    const paid = paidBillCategories(
      [
        {
          date: '2026-10-12',
          category: 'water',
          payee: 'iredell',
          schedule: 'w',
        },
        {
          date: '2026-11-13',
          category: 'water',
          payee: 'iredell',
          schedule: 'w',
        },
      ],
      [{ id: 'w', next_date: '2026-11-12', _payee: 'iredell' }],
      month,
    );
    expect(paid.has('water')).toBe(true);
  });

  it('is not paid before the bill is linked, even if a charge came in', () => {
    const paid = paidBillCategories(
      [
        {
          date: '2026-11-18',
          category: 'gas',
          payee: 'enbridge',
          schedule: null,
        },
      ],
      [{ id: 'g', next_date: '2026-11-21', _payee: 'enbridge' }],
      month,
    );
    expect(paid.has('gas')).toBe(false);
  });

  it('waits for every bill in the category', () => {
    const transactions = [
      {
        date: '2026-10-15',
        category: 'storage',
        payee: 'extra',
        schedule: 'e',
      },
      { date: '2026-10-21', category: 'storage', payee: 'cube', schedule: 'c' },
      {
        date: '2026-11-15',
        category: 'storage',
        payee: 'extra',
        schedule: 'e',
      },
    ];
    const schedules = [
      { id: 'e', next_date: '2026-11-15', _payee: 'extra' },
      { id: 'c', next_date: '2026-11-21', _payee: 'cube' },
    ];
    expect(
      paidBillCategories(transactions, schedules, month).has('storage'),
    ).toBe(false);
    transactions.push({
      date: '2026-11-21',
      category: 'storage',
      payee: 'cube',
      schedule: 'c',
    });
    expect(
      paidBillCategories(transactions, schedules, month).has('storage'),
    ).toBe(true);
  });

  it('finds a bill by its payee when it was never linked before', () => {
    const paid = paidBillCategories(
      [
        { date: '2026-11-03', category: 'subs', payee: 'apple', schedule: 'a' },
        {
          date: '2026-10-30',
          category: 'subs',
          payee: 'anthropic',
          schedule: null,
        },
      ],
      [
        { id: 'a', next_date: '2026-11-03', _payee: 'apple' },
        { id: 'claude', next_date: '2026-11-30', _payee: 'anthropic' },
      ],
      month,
    );
    expect(paid.has('subs')).toBe(false);
  });

  it('ignores bills not due until next month', () => {
    const paid = paidBillCategories(
      [
        {
          date: '2026-11-09',
          category: 'mortgage',
          payee: 'cc',
          schedule: 'm',
        },
      ],
      [
        { id: 'm', next_date: '2026-12-07', _payee: 'cc' },
        { id: 'yearly', next_date: '2027-03-01', _payee: 'cc' },
      ],
      month,
    );
    expect(paid.has('mortgage')).toBe(true);
  });
});
