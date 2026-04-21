import React, { useEffect, useRef, useCallback, useMemo, useContext } from 'react';
import { TreeView, type TreeViewRef } from 'devextreme-react/tree-view';
import * as events from 'devextreme-react/common/core/events';
import { navigation, type NavItem } from '../../app-navigation';
import { useNavigation } from '../../contexts/navigation-hooks';
import { useScreenSize } from '../../utils/media-query';
import './SideNavigationMenu.scss';
import type { SideNavigationMenuProps } from '../../types';

import { ThemeContext } from '../../theme';

function normalizePaths(items: NavItem[]): NavItem[] {
  return items.map((item) => {
    const path =
      item.path && !/^\//.test(item.path) && !item.path.startsWith('__')
        ? `/${item.path}`
        : item.path;
    const next: NavItem = {
      ...item,
      path,
      items: item.items ? normalizePaths(item.items) : undefined,
    };
    return next;
  });
}

function withExpandedState(items: NavItem[], isLarge: boolean): NavItem[] {
  return items.map((item) => ({
    ...item,
    expanded: item.items ? isLarge : undefined,
    items: item.items ? withExpandedState(item.items, isLarge) : undefined,
  }));
}

export default function SideNavigationMenu(props: React.PropsWithChildren<SideNavigationMenuProps>) {
  const {
    children,
    selectedItemChanged,
    openMenu,
    compactMode,
    onMenuReady
  } = props;

  const theme = useContext(ThemeContext);
  const { isLarge } = useScreenSize();

  const items = useMemo(
    () => withExpandedState(normalizePaths(navigation), isLarge),
    [isLarge],
  );

  const { navigationData: { currentPath } } = useNavigation();

  const treeViewRef = useRef<TreeViewRef>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const getWrapperRef = useCallback((element: HTMLDivElement) => {
    const prevElement = wrapperRef.current;
    if (prevElement) {
      events.off(prevElement, 'dxclick');
    }

    wrapperRef.current = element;
    events.on(element, 'dxclick', (e: React.PointerEvent) => {
      openMenu(e);
    });
  }, [openMenu]);

  useEffect(() => {
    const treeView = treeViewRef.current && treeViewRef.current.instance();
    if (!treeView) {
      return;
    }

    if (currentPath !== undefined && currentPath.startsWith('/')) {
      treeView.selectItem(currentPath);
      treeView.expandItem(currentPath);
    }

    if (compactMode) {
      treeView.collapseAll();
    }
  }, [currentPath, compactMode]);

  return (
    <div
      className={`dx-swatch-additional${theme?.isDark() ? '-dark' : ''} side-navigation-menu`}
      ref={getWrapperRef}
    >
      {children}
      <div className={'menu-container'}>
        <TreeView
          ref={treeViewRef}
          items={items}
          keyExpr={'path'}
          selectionMode={'single'}
          focusStateEnabled={false}
          expandEvent={'click'}
          onItemClick={selectedItemChanged}
          onContentReady={onMenuReady}
          width={'100%'}
        />
      </div>
    </div>
  );
}
