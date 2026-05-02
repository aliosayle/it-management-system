import React, { useEffect, useRef, useCallback, useMemo, useContext } from "react";
import { TreeView, type TreeViewRef } from "devextreme-react/tree-view";
import type { ItemRenderedEvent } from "devextreme/ui/tree_view";
import * as events from "devextreme-react/common/core/events";
import { navigation, type NavItem } from "../../app-navigation";
import { useNavigation } from "../../contexts/navigation-hooks";
import "./SideNavigationMenu.scss";
import type { SideNavigationMenuProps } from "../../types";

import { ThemeContext } from "../../theme";

function normalizePaths(items: NavItem[]): NavItem[] {
  return items.map((item) => {
    const path =
      item.path && !/^\//.test(item.path) ? `/${item.path}` : item.path;
    return { ...item, path };
  });
}

export default function SideNavigationMenu(props: React.PropsWithChildren<SideNavigationMenuProps>) {
  const { children, selectedItemChanged, openMenu, compactMode, onMenuReady } = props;

  const theme = useContext(ThemeContext);

  const items = useMemo(() => normalizePaths(navigation), []);

  const {
    navigationData: { currentPath },
  } = useNavigation();

  const treeViewRef = useRef<TreeViewRef>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const getWrapperRef = useCallback(
    (element: HTMLDivElement) => {
      const prevElement = wrapperRef.current;
      if (prevElement) {
        events.off(prevElement, "dxclick");
      }

      wrapperRef.current = element;
      events.on(element, "dxclick", (e: React.PointerEvent) => {
        openMenu(e);
      });
    },
    [openMenu],
  );

  useEffect(() => {
    const treeView = treeViewRef.current?.instance();
    if (!treeView) {
      return;
    }

    if (currentPath !== undefined && currentPath.startsWith("/")) {
      treeView.selectItem(currentPath);
      treeView.expandItem(currentPath);
    }

    if (compactMode) {
      treeView.collapseAll();
    }
  }, [currentPath, compactMode]);

  const onItemRendered = useCallback((e: ItemRenderedEvent<NavItem>) => {
    const label = e.itemData?.text;
    if (typeof label === "string" && label.length > 0) {
      e.itemElement?.setAttribute("title", label);
    }
  }, []);

  return (
    <div
      className={`dx-swatch-additional${theme?.isDark() ? "-dark" : ""} side-navigation-menu${compactMode ? " side-navigation-menu--compact" : ""}`}
      ref={getWrapperRef}
    >
      {children}
      <div className="menu-container">
        <TreeView
          ref={treeViewRef}
          items={items}
          keyExpr="path"
          selectionMode="single"
          focusStateEnabled={false}
          expandEvent="click"
          onItemClick={selectedItemChanged}
          onContentReady={onMenuReady}
          onItemRendered={onItemRendered}
          width="100%"
        />
      </div>
    </div>
  );
}
