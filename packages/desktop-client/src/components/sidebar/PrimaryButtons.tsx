import React, { Fragment } from 'react';
import { useTranslation } from 'react-i18next';

import { SvgCog, SvgMoneyBag } from '@actual-app/components/icons/v1';
import { View } from '@actual-app/components/view';

import { useSidebarMenu } from '#hooks/useSidebarMenu';

import { Item } from './Item';
import { getSidebarMenuItemPath } from './sidebarMenu';
import { useSidebarMenuItemDetails } from './useSidebarMenuItemDetails';

export function PrimaryButtons() {
  const { t } = useTranslation();
  const { sidebarItems } = useSidebarMenu();
  const itemDetails = useSidebarMenuItemDetails();

  return (
    <View data-testid="sidebar-primary-buttons" style={{ flexShrink: 0 }}>
      {sidebarItems.map(item => (
        <Fragment key={item.id}>
          <Item
            title={itemDetails[item.id].title}
            Icon={itemDetails[item.id].Icon}
            to={getSidebarMenuItemPath(item.id, true)}
          />
          {/* Custom branch: Income page, right under Budget. */}
          {item.id === 'budget' && (
            <Item title={t('Income')} Icon={SvgMoneyBag} to="/income" />
          )}
        </Fragment>
      ))}
      <Item title={t('Settings')} Icon={SvgCog} to="/settings" />
    </View>
  );
}
