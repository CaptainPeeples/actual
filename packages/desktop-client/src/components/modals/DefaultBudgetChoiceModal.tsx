// Custom branch: after a budget amount is changed, ask whether it's for this
// month only or the new default budget (see server/budget/default-budget).
import React, { useRef } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { useResponsive } from '@actual-app/components/hooks/useResponsive';
import { InitialFocus } from '@actual-app/components/initial-focus';
import { Paragraph } from '@actual-app/components/paragraph';
import { styles } from '@actual-app/components/styles';
import { View } from '@actual-app/components/view';
import * as monthUtils from '@actual-app/core/shared/months';

import { Modal, ModalCloseButton, ModalHeader } from '#components/common/Modal';
import { useCategories } from '#hooks/useCategories';
import { useFormat } from '#hooks/useFormat';
import { useLocale } from '#hooks/useLocale';
import type { Modal as ModalType } from '#modals/modalsSlice';

type DefaultBudgetChoiceModalProps = Extract<
  ModalType,
  { name: 'default-budget-choice' }
>['options'];

export function DefaultBudgetChoiceModal({
  month,
  category,
  amount,
  onOnlyThisMonth,
  onChangeDefault,
}: DefaultBudgetChoiceModalProps) {
  const { t } = useTranslation();
  const { isNarrowWidth } = useResponsive();
  const locale = useLocale();
  const format = useFormat();
  const { data: categories } = useCategories();
  const chosen = useRef(false);

  const name =
    categories?.list.find(c => c.id === category)?.name ?? t('this category');
  const displayMonth = monthUtils.format(month, 'MMMM yyyy', locale);
  const buttonStyle = isNarrowWidth ? { height: styles.mobileMinHeight } : {};

  const choose = (choice: () => void, close: () => void) => {
    chosen.current = true;
    choice();
    close();
  };

  return (
    <Modal
      name="default-budget-choice"
      // Closing without picking keeps the change for this month only.
      onClose={() => {
        if (!chosen.current) {
          chosen.current = true;
          onOnlyThisMonth();
        }
      }}
    >
      {({ state }) => (
        <>
          <ModalHeader
            title={t('Change budget')}
            rightContent={<ModalCloseButton onPress={() => state.close()} />}
          />
          <View style={{ lineHeight: 1.5, maxWidth: 420 }}>
            <Paragraph>
              {t(
                'Set {{name}} to {{amount}} for {{month}} only, or make it the default budget? The default also updates every month after this one.',
                {
                  name,
                  amount: format(amount, 'financial'),
                  month: displayMonth,
                },
              )}
            </Paragraph>
            <View
              style={{
                flexDirection: isNarrowWidth ? 'column' : 'row',
                justifyContent: 'flex-end',
                gap: 10,
              }}
            >
              <Button
                style={buttonStyle}
                onPress={() => choose(onOnlyThisMonth, () => state.close())}
              >
                <Trans>Only this month</Trans>
              </Button>
              <InitialFocus>
                <Button
                  variant="primary"
                  style={buttonStyle}
                  onPress={() => choose(onChangeDefault, () => state.close())}
                >
                  <Trans>Change the default</Trans>
                </Button>
              </InitialFocus>
            </View>
          </View>
        </>
      )}
    </Modal>
  );
}
