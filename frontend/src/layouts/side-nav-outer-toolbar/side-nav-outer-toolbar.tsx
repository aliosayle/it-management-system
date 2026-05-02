import Drawer from 'devextreme-react/drawer';
import React, { useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header, SideNavigationMenu, Footer } from '../../components';
import './side-nav-outer-toolbar.scss';
import { useScreenSize } from '../../utils/media-query';
import { Template } from 'devextreme-react/core/template';
import { useMenuPatch } from '../../utils/patches';
import type { ButtonTypes } from 'devextreme-react/button';
import type { TreeViewTypes } from 'devextreme-react/tree-view';
import type { SideNavToolbarProps } from '../../types';

export default function SideNavOuterToolbar({ title, children }: React.PropsWithChildren<SideNavToolbarProps>) {
  const mainScrollRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { isXSmall, isLarge } = useScreenSize();
  const [patchCssClass, onMenuReady] = useMenuPatch();
  const [menuStatus, setMenuStatus] = useState(
    isLarge ? MenuStatus.Opened : MenuStatus.Closed
  );

  const toggleMenu = useCallback(({ event }: ButtonTypes.ClickEvent) => {
    setMenuStatus(
      prevMenuStatus => prevMenuStatus === MenuStatus.Closed
        ? MenuStatus.Opened
        : MenuStatus.Closed
    );
    event?.stopPropagation();
  }, []);

  const temporaryOpenMenu = useCallback(() => {
    setMenuStatus(
      prevMenuStatus => prevMenuStatus === MenuStatus.Closed
        ? MenuStatus.TemporaryOpened
        : prevMenuStatus
    );
  }, []);

  const onOutsideClick = useCallback(() => {
    setMenuStatus(
      prevMenuStatus => prevMenuStatus !== MenuStatus.Closed && !isLarge
        ? MenuStatus.Closed
        : prevMenuStatus
    );
    return menuStatus === MenuStatus.Closed ? true : false;
  }, [isLarge, menuStatus]);

  const onNavigationChanged = useCallback(({ itemData, event, node }: TreeViewTypes.ItemClickEvent) => {
    const path = itemData?.path as string | undefined;
    const isRoute = typeof path === 'string' && path.startsWith('/');
    if (!isRoute) {
      return;
    }
    if (menuStatus === MenuStatus.Closed || node?.selected) {
      event?.preventDefault();
      return;
    }

    navigate(path);
    if (mainScrollRef.current) {
      mainScrollRef.current.scrollTop = 0;
    }

    if (!isLarge || menuStatus === MenuStatus.TemporaryOpened) {
      setMenuStatus(MenuStatus.Closed);
      event?.stopPropagation();
    }
  }, [navigate, menuStatus, isLarge]);

  return (
    <div className={'side-nav-outer-toolbar'}>
      <Header
        menuToggleEnabled
        toggleMenu={toggleMenu}
        title={title}
      />
      <Drawer
        className={['drawer layout-body', patchCssClass].join(' ')}
        position={'before'}
        closeOnOutsideClick={onOutsideClick}
        openedStateMode={isLarge ? 'shrink' : 'overlap'}
        revealMode={isXSmall ? 'slide' : 'expand'}
        minSize={isXSmall ? 0 : 60}
        maxSize={264}
        shading={isLarge ? false : true}
        opened={menuStatus === MenuStatus.Closed ? false : true}
        template={'menu'}
      >
        <div className={'container'}>
          <div ref={mainScrollRef} className={'layout-main-with-footer'}>
            <div className={'content layout-route-content'}>
              {React.Children.map(children, (item) => {
                if (React.isValidElement(item) && item.type !== Footer) {
                  return item;
                }
                return null;
              })}
            </div>
            <div className={'footer-slot'}>
              {React.Children.map(children, (item) => {
                if (React.isValidElement(item) && item.type === Footer) {
                  return item;
                }
                return null;
              })}
            </div>
          </div>
        </div>
        <Template name={'menu'}>
          <SideNavigationMenu
            compactMode={menuStatus === MenuStatus.Closed}
            selectedItemChanged={onNavigationChanged}
            openMenu={temporaryOpenMenu}
            onMenuReady={onMenuReady}
          >
          </SideNavigationMenu>
        </Template>
      </Drawer>
    </div>
  );
}

const MenuStatus = {
  Closed: 1,
  Opened: 2,
  TemporaryOpened: 3
};
