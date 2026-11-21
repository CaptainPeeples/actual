import { useTranslation } from 'react-i18next';

import { useResponsive } from '@actual-app/components/hooks/useResponsive';
import {
  SvgCalculator,
  SvgCog,
  SvgMoneyBag,
  SvgPiggyBank,
  SvgPylon,
  SvgWallet,
} from '@actual-app/components/icons/v1';
import { SvgSettingsSliderAlternate } from '@actual-app/components/icons/v2';
import { theme } from '@actual-app/components/theme';
import { spacing } from '@actual-app/components/tokens';
import { View } from '@actual-app/components/view';

import {
  getDefaultSidebarMenuItems,
  getSidebarMenuItemPath,
  isInMobileSettingsNav,
  isSettingsSection,
} from '#components/sidebar/sidebarMenu';
import { useSidebarMenuItemDetails } from '#components/sidebar/useSidebarMenuItemDetails';
import { useSidebarMenu } from '#hooks/useSidebarMenu';

import { SettingsNavLink } from './SettingsNavLink';

export function SettingsNav() {
  const { t } = useTranslation();
  const { isNarrowWidth } = useResponsive();
  const { settingsItems, isItemAvailable } = useSidebarMenu();
  const itemDetails = useSidebarMenuItemDetails();

  const menuItems = isNarrowWidth
    ? getDefaultSidebarMenuItems().filter(
        item =>
          isSettingsSection(item.id) &&
          isInMobileSettingsNav(item.id) &&
          isItemAvailable(item.id),
      )
    : settingsItems;

  return (
    <View
      role="navigation"
      aria-label={t('Settings')}
      style={
        isNarrowWidth
          ? {
              flexShrink: 0,
              backgroundColor: theme.settingsCardBackground,
              border: `1px solid ${theme.settingsCardBorder}`,
              borderRadius: 6,
            }
          : { width: 180, flexShrink: 0, gap: spacing.xxs }
      }
    >
      <SettingsNavLink
        title={t('General')}
        Icon={SvgCog}
        to="/settings/general"
      />
      {/* Custom branch: default budget for future months. */}
      <SettingsNavLink
        title={t('Default budget')}
        Icon={SvgPiggyBank}
        to="/settings/default-budget"
      />
      {/* Custom branch: Income page settings. */}
      <SettingsNavLink
        title={t('Income')}
        Icon={SvgMoneyBag}
        to="/settings/income"
      />
      <SettingsNavLink
        title={t('Taxes')}
        Icon={SvgCalculator}
        to="/settings/taxes"
      />
      <SettingsNavLink
        title={t('Deductions')}
        Icon={SvgWallet}
        to="/settings/deductions"
      />
      {menuItems.map(item => (
        <SettingsNavLink
          key={item.id}
          title={itemDetails[item.id].title}
          Icon={itemDetails[item.id].Icon}
          to={getSidebarMenuItemPath(item.id, false)}
        />
      ))}
      <SettingsNavLink
        title={t('Advanced')}
        Icon={SvgSettingsSliderAlternate}
        to="/settings/advanced"
      />
      <SettingsNavLink
        title={t('Experimental')}
        Icon={SvgPylon}
        to="/settings/experimental"
      />
    </View>
  );
}
