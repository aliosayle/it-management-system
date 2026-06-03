import { useMemo, useCallback } from 'react';
import { useNavigate } from "react-router-dom";
import DropDownButton from 'devextreme-react/drop-down-button';
import List from 'devextreme-react/list';
import { useAuth } from '../../contexts/auth-hooks';
import defaultUser from '../../utils/default-user';
import './UserPanel.scss';
import type { UserPanelProps } from '../../types';

export default function UserPanel({ menuMode }: UserPanelProps) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

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

  const profileButton = (
    <DropDownButton
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
        <div className="user-panel__header">
          <div className="user-panel__identity" aria-label="Signed-in user">
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
