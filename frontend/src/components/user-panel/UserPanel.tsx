import { useMemo, useCallback } from 'react';
import { useNavigate } from "react-router-dom";
import DropDownButton from 'devextreme-react/drop-down-button';
import List from 'devextreme-react/list';
import { useAuth } from '../../contexts/auth-hooks';
import './UserPanel.scss';
import type { UserPanelProps } from '../../types';

export default function UserPanel({ menuMode }: UserPanelProps) {
  const { signOut } = useAuth();
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

  return (
    <div className='user-panel'>
      {menuMode === 'context' && (
        <DropDownButton
            stylingMode='text'
            icon='https://js.devexpress.com/Demos/WidgetsGallery/JSDemos/images/employees/06.png'
            showArrowIcon={false}
            elementAttr={dropDownButtonAttributes}
            dropDownOptions={buttonDropDownOptions}
            items={menuItems}>
        </DropDownButton>
      )}
      {menuMode === 'list' && (
        <List items={menuItems} />
      )}
    </div>
  );
}
