// Custom branch: small form pieces shared by the Income settings pages.
import React from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { SvgAdd, SvgTrash } from '@actual-app/components/icons/v1';
import { Input } from '@actual-app/components/input';
import { Select } from '@actual-app/components/select';
import { styles } from '@actual-app/components/styles';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { spacing } from '@actual-app/components/tokens';
import { View } from '@actual-app/components/view';
import type {
  CheckFilter,
  Payday,
} from '@actual-app/core/shared/paycheck/types';
import { v4 as uuidv4 } from 'uuid';

export function newId(): string {
  return uuidv4();
}

function parseNumber(text: string): number | null {
  const cleaned = text.replace(/[$,%\s]/g, '');
  if (cleaned === '') {
    return 0;
  }
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

type NumberFieldProps = {
  value: number;
  onChange: (value: number) => void;
  label: string;
  prefix?: string;
  suffix?: string;
  width?: number;
  // Short box that fits inside a text line (no taller than the text).
  compact?: boolean;
};

// A number box that saves when you leave it or press Enter.
export function NumberField({
  value,
  onChange,
  label,
  prefix,
  suffix,
  width = 100,
  compact = false,
}: NumberFieldProps) {
  // Show at most 2 decimals. Only save when the text was changed, so a
  // stored value with more decimals isn't rounded just by tabbing past it.
  const shown = value ? String(Number(value.toFixed(2))) : '';
  const commit = (text: string) => {
    if (text.trim() === shown) {
      return;
    }
    const parsed = parseNumber(text);
    if (parsed != null && parsed !== value) {
      onChange(parsed);
    }
  };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      {prefix && <Text style={{ color: theme.pageTextSubdued }}>{prefix}</Text>}
      <Input
        key={String(value)}
        aria-label={label}
        inputMode="decimal"
        defaultValue={shown}
        placeholder="0"
        onUpdate={commit}
        onEnter={commit}
        style={{
          width,
          textAlign: 'right',
          ...(compact
            ? { padding: '0 5px', height: '1.4em', lineHeight: '1.4em' }
            : {}),
        }}
      />
      {suffix && <Text style={{ color: theme.pageTextSubdued }}>{suffix}</Text>}
    </View>
  );
}

type TextFieldProps = {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
  width?: number;
  type?: string;
};

export function TextField({
  value,
  onChange,
  label,
  placeholder,
  width = 160,
  type,
}: TextFieldProps) {
  const commit = (text: string) => {
    if (text !== value) {
      onChange(text);
    }
  };
  return (
    <Input
      key={value}
      aria-label={label}
      type={type}
      defaultValue={value}
      placeholder={placeholder}
      onUpdate={commit}
      onEnter={commit}
      style={{ width }}
    />
  );
}

// "Every check" or one payday's check.
export function ChecksSelect({
  value,
  paydays,
  onChange,
}: {
  value: CheckFilter;
  paydays: Payday[];
  onChange: (value: CheckFilter) => void;
}) {
  const { t } = useTranslation();
  const options: Array<[string, string]> = [
    ['all', t('Every check')],
    ...paydays.map(
      p =>
        [p.id, t('{{name}} check only', { name: p.name })] as [string, string],
    ),
  ];
  const current = value === 'all' ? 'all' : (value[0] ?? 'all');
  return (
    <Select
      value={current}
      options={options}
      onChange={id => onChange(id === 'all' ? 'all' : [id])}
    />
  );
}

// A labeled control stacked over its label, for rows of several fields.
export function Field({
  label,
  children,
  style,
}: {
  label: ReactNode;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <View style={{ gap: 2, ...style }}>
      <Text style={{ ...styles.verySmallText, color: theme.pageTextSubdued }}>
        {label}
      </Text>
      {children}
    </View>
  );
}

export function ItemRow({ children }: { children: ReactNode }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'flex-end',
        gap: spacing.sm,
        padding: `${spacing.md}px ${spacing.lg}px`,
      }}
    >
      {children}
    </View>
  );
}

export function RemoveButton({
  onPress,
  label,
}: {
  onPress: () => void;
  label: string;
}) {
  return (
    <Button variant="bare" aria-label={label} onPress={onPress}>
      <SvgTrash width={13} height={13} />
    </Button>
  );
}

export function AddButton({
  onPress,
  children,
}: {
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <View style={{ padding: `${spacing.sm}px ${spacing.lg}px` }}>
      <Button
        variant="bare"
        onPress={onPress}
        style={{ alignSelf: 'flex-start', gap: 6 }}
      >
        <SvgAdd width={10} height={10} />
        {children}
      </Button>
    </View>
  );
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return (
    <Text
      style={{
        ...styles.smallText,
        color: theme.pageTextSubdued,
        padding: `${spacing.md}px ${spacing.lg}px`,
      }}
    >
      {children}
    </Text>
  );
}
