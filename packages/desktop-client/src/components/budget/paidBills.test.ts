import { billStatus, categoryChecked, groupBillsPaid } from './paidBills';

const month = '2026-11';
const setCategory = (value: string) => [
  { op: 'set', field: 'category', value },
];

describe('billStatus', () => {
  it('counts a bill paid once it is linked, and owes nothing more', () => {
    const status = billStatus(
      [{ date: '2026-11-13', category: 'water', payee: 'iw', schedule: 'w' }],
      [
        {
          id: 'w',
          next_date: '2026-11-12',
          _amount: -7500,
          _actions: setCategory('water'),
        },
      ],
      month,
    );
    expect(status.paid.has('water')).toBe(true);
    expect(status.owed.get('water')).toBe(0);
  });

  it('owes the bill amount until it is linked, even if a charge came in', () => {
    const status = billStatus(
      [{ date: '2026-11-18', category: 'gas', payee: 'eg', schedule: null }],
      [
        {
          id: 'g',
          next_date: '2026-11-21',
          _amount: -20000,
          _actions: setCategory('gas'),
        },
      ],
      month,
    );
    expect(status.paid.has('gas')).toBe(false);
    expect(status.owed.get('gas')).toBe(20000);
  });

  it('adds up every bill still due in a category', () => {
    const schedules = [
      {
        id: 'apple-one',
        next_date: '2026-11-26',
        _amount: -4204,
        _actions: setCategory('subs'),
      },
      {
        id: 'claude',
        next_date: '2026-11-30',
        _amount: -10000,
        _actions: setCategory('subs'),
      },
      {
        id: 'plex',
        next_date: '2026-12-01',
        _amount: -1000,
        _actions: setCategory('subs'),
      },
      {
        id: 'insurance',
        next_date: '2026-11-19',
        _amount: { num1: -6000, num2: -5000 },
        _actions: setCategory('subs'),
      },
    ];
    const status = billStatus(
      [
        {
          date: '2026-11-19',
          category: 'subs',
          payee: 'apple',
          schedule: 'insurance',
        },
      ],
      schedules,
      month,
    );
    expect(status.owed.get('subs')).toBe(14204);
    expect(status.paid.has('subs')).toBe(false);
  });

  it('uses the middle of an "is between" amount', () => {
    const status = billStatus(
      [],
      [
        {
          id: 'e',
          next_date: '2026-11-20',
          _amount: { num1: -65000, num2: -30000 },
          _actions: setCategory('electric'),
        },
      ],
      month,
    );
    expect(status.owed.get('electric')).toBe(47500);
  });

  it('owes nothing when a bill category has no bill this month', () => {
    const status = billStatus(
      [],
      [
        {
          id: 'dog',
          next_date: '2026-12-01',
          _amount: -6000,
          _actions: setCategory('henry'),
        },
      ],
      month,
    );
    expect(status.billCategories.has('henry')).toBe(true);
    expect(status.owed.get('henry')).toBe(0);
    expect(status.hasBills.has('henry')).toBe(false);
  });

  it('counts a bill paid even if it landed in another category', () => {
    const status = billStatus(
      [{ date: '2026-11-14', category: 'other', payee: 'g', schedule: 'a' }],
      [
        {
          id: 'a',
          next_date: '2026-11-12',
          _amount: -25000,
          _actions: setCategory('auto'),
        },
      ],
      month,
    );
    expect(status.owed.get('auto')).toBe(0);
  });

  it('falls back to where a schedule was linked when it sets no category', () => {
    const status = billStatus(
      [
        {
          date: '2026-10-09',
          category: 'mortgage',
          payee: 'cc',
          schedule: 'm',
        },
        {
          date: '2026-11-09',
          category: 'mortgage',
          payee: 'cc',
          schedule: 'm',
        },
      ],
      [{ id: 'm', next_date: '2026-12-09', _amount: -233249 }],
      month,
    );
    expect(status.paid.has('mortgage')).toBe(true);
    expect(status.owed.get('mortgage')).toBe(0);
  });
});

describe('groupBillsPaid', () => {
  const status = billStatus(
    [{ date: '2026-11-09', category: 'mortgage', payee: 'cc', schedule: 'm' }],
    [
      {
        id: 'm',
        next_date: '2026-11-07',
        _amount: -233249,
        _actions: setCategory('mortgage'),
      },
      {
        id: 'w',
        next_date: '2026-11-12',
        _amount: -7500,
        _actions: setCategory('water'),
      },
    ],
    month,
  );

  it('knows which categories have bills', () => {
    expect([...status.hasBills].sort()).toEqual(['mortgage', 'water']);
    expect([...status.paid]).toEqual(['mortgage']);
  });

  it('needs every bill in the group paid', () => {
    expect(groupBillsPaid(status, ['mortgage', 'hoa'])).toBe(true);
    expect(groupBillsPaid(status, ['mortgage', 'water'])).toBe(false);
    expect(groupBillsPaid(status, ['hoa'])).toBe(false);
    expect(groupBillsPaid(null, ['mortgage'])).toBe(false);
  });
});

describe('categoryChecked', () => {
  const empty = billStatus([], [], month);
  const week = (n: number) => ({ id: `w${n}`, name: `Week ${n} (note)` });

  it('checks weeks that are over this month, and only those', () => {
    const today = '2026-11-20';
    expect(categoryChecked(empty, week(1), month, today)).toBe(true);
    expect(categoryChecked(empty, week(2), month, today)).toBe(true);
    expect(categoryChecked(empty, week(3), month, today)).toBe(false);
    expect(categoryChecked(empty, week(4), month, today)).toBe(false);
  });

  it('checks every week of a past month and none of a future one', () => {
    expect(categoryChecked(empty, week(4), '2026-10', '2026-11-01')).toBe(true);
    expect(categoryChecked(empty, week(1), '2026-12', '2026-11-30')).toBe(
      false,
    );
  });

  it('works for named weeks and leaves other categories alone', () => {
    const today = '2026-11-08';
    const gas = { id: 'g', name: 'Gas Week 1' };
    const food = { id: 'f', name: 'Groceries' };
    expect(categoryChecked(empty, gas, month, today)).toBe(true);
    expect(categoryChecked(empty, food, month, today)).toBe(false);
  });

  it('does not count a finished week as a paid bill', () => {
    const status = billStatus([], [], month);
    categoryChecked(status, week(1), month, '2026-11-20');
    expect(status.paid.size).toBe(0);
    expect(groupBillsPaid(status, ['w1'])).toBe(false);
  });
});
