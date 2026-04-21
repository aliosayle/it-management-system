import React, { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Form, {
  Item,
  Label,
  ButtonItem,
  ButtonOptions,
  RequiredRule,
  EmailRule,
  type FormTypes,
} from 'devextreme-react/form';
import LoadIndicator from 'devextreme-react/load-indicator';
import notify from 'devextreme/ui/notify';
import { useAuth } from '../../contexts/auth-hooks';

import './LoginForm.scss';

export default function LoginForm() {
  const { signIn } = useAuth();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({ email: '', password: '' });

  const onFieldDataChanged = useCallback((e: FormTypes.FieldDataChangedEvent) => {
    const { dataField, value } = e;

    if (dataField) {
      setFormData(formData => ({
        ...formData,
        [dataField]: value,
      }));
    }
  }, []);

  const onSubmit = useCallback(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const { email, password } = formData;
    setLoading(true);

    const result = await signIn(email, password);
    if (!result.isOk) {
      setLoading(false);
      notify(result.message, 'error', 2000);
    }
  }, [signIn, formData]);

  return (
    <form className={'login-form'} onSubmit={onSubmit}>
      <Form formData={formData} disabled={loading} onFieldDataChanged={onFieldDataChanged}>
        <Item
          dataField={'email'}
          editorType={'dxTextBox'}
          editorOptions={emailEditorOptions}
        >
          <RequiredRule message="Email is required" />
          <EmailRule message="Email is invalid" />
          <Label visible={false} />
        </Item>
        <Item
          dataField={'password'}
          editorType={'dxTextBox'}
          editorOptions={passwordEditorOptions}
        >
          <RequiredRule message="Password is required" />
          <Label visible={false} />
        </Item>
        <Item
          dataField={'rememberMe'}
          editorType={'dxCheckBox'}
          editorOptions={rememberMeEditorOptions}
        >
          <Label visible={false} />
        </Item>
        <ButtonItem>
          <ButtonOptions
            width={'100%'}
            type={'default'}
            useSubmitBehavior={true}
          >
            <span className="dx-button-text">
              {
                loading
                  ? <LoadIndicator width={'24px'} height={'24px'} visible={true} />
                  : 'Sign In'
              }
            </span>
          </ButtonOptions>
        </ButtonItem>
      </Form>
      <div className={'link'}>
        <Link to={'/reset-password'}>Forgot password?</Link>
      </div>
    </form>
  );
}

const emailEditorOptions = { stylingMode: 'filled', placeholder: 'Email', mode: 'email' };
const passwordEditorOptions = { stylingMode: 'filled', placeholder: 'Password', mode: 'password' };
const rememberMeEditorOptions = { text: 'Remember me', elementAttr: { class: 'form-text' } };
