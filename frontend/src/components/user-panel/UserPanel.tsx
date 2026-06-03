import { useMemo, useCallback, useRef } from 'react';
import { useNavigate } from "react-router-dom";
import DropDownButton, {
  type DropDownButtonRef,
} from 'devextreme-react/drop-down-button';
import List from 'devextreme-react/list';
import { useAuth } from '../../contexts/auth-hooks';
import defaultUser from '../../utils/default-user';
import './UserPanel.scss';
import type { UserPanelProps } from '../../types';

export default function UserPanel({ menuMode }: UserPanelProps) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const menuRef = useRef<DropDownButtonRef>(null);

  const navigateToProducts = useCallback(() => {
    navigate("/products");
  }, [navigate]);

  const menuItems = useMemo(() => ([
    {
      text: 'Products',
      icon: 'product',
      onClick: navigateToProducts
    },
    {
      text: 'Logout',
      icon: 'runner',
      onClick: signOut
    }
  ]), [navigateToProducts, signOut]);

  const dropDownButtonAttributes = {
    class: 'user-button'
  };

  const buttonDropDownOptions = {
    width: '150px'
  };

  const avatarUrl = user?.avatarUrl ?? defaultUser.avatarUrl;
  const displayName = user?.displayName ?? "User";
  const email = user?.email ?? "";

  const openMenu = useCallback(() => {
    menuRef.current?.instance()?.open();
  }, []);

  const onTriggerKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openMenu();
      }
    },
    [openMenu],
  );

  const profileButton = (
    <DropDownButton
      ref={menuRef}
      stylingMode="text"
      icon={avatarUrl}
      showArrowIcon={false}
      elementAttr={dropDownButtonAttributes}
      dropDownOptions={buttonDropDownOptions}
      items={menuItems}
    />
  );

  return (
    <div className="user-panel">
      {menuMode === 'context' && (
        <div
          className="user-panel__trigger"
          role="button"
          tabIndex={0}
          aria-haspopup="menu"
          aria-label="User menu"
          onClick={openMenu}
          onKeyDown={onTriggerKeyDown}
        >
          <div className="user-panel__identity">
            <span className="user-panel__name">{displayName}</span>
            {email ? <span className="user-panel__email">{email}</span> : null}
          </div>
          {profileButton}
        </div>
      )}
      {menuMode === 'list' && (
        <>
          <div className="user-panel__identity user-panel__identity--menu">
            <span className="user-panel__name">{displayName}</span>
            {email ? <span className="user-panel__email">{email}</span> : null}
          </div>
          <List items={menuItems} />
        </>
      )}
    </div>
  );
}
