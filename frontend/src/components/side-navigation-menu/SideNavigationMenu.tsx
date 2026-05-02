import React, { useCallback, useMemo, useContext } from "react";
import List from "devextreme-react/list";
import type { ItemClickEvent } from "devextreme/ui/list";
import * as events from "devextreme-react/common/core/events";
import type { TreeViewTypes } from "devextreme-react/tree-view";
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

function NavListItem(data: NavItem) {
  return (
    <div className="side-navigation-menu__row">
      {data.icon ? <i className={`dx-icon dx-icon-${data.icon}`} /> : null}
      <span className="side-navigation-menu__row-label">{data.text}</span>
    </div>
  );
}

export default function SideNavigationMenu(props: React.PropsWithChildren<SideNavigationMenuProps>) {
  const { children, selectedItemChanged, openMenu, compactMode: _compactMode, onMenuReady } = props;

  const theme = useContext(ThemeContext);

  const items = useMemo(() => normalizePaths(navigation), []);

  const {
    navigationData: { currentPath },
  } = useNavigation();

  const wrapperRef = React.useRef<HTMLDivElement>(null);
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

  const handleItemClick = useCallback(
    (e: ItemClickEvent<NavItem, string>) => {
      selectedItemChanged({
        itemData: e.itemData,
        event: e.event,
        node: undefined,
      } as TreeViewTypes.ItemClickEvent);
    },
    [selectedItemChanged],
  );

  return (
    <div
      className={`dx-swatch-additional${theme?.isDark() ? "-dark" : ""} side-navigation-menu`}
      ref={getWrapperRef}
    >
      {children}
      <div className={"menu-container"}>
        <List
          dataSource={items}
          keyExpr="path"
          itemRender={NavListItem}
          selectionMode="single"
          selectByClick
          focusStateEnabled={false}
          selectedItemKeys={currentPath?.startsWith("/") ? [currentPath] : []}
          onItemClick={handleItemClick}
          onContentReady={onMenuReady}
          width="100%"
          className="side-navigation-menu__list"
        />
      </div>
    </div>
  );
}
