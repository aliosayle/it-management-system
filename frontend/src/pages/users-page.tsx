import { useMemo } from "react";
import CustomStore from "devextreme/data/custom_store";
import {
  Column,
  Paging,
  Pager,
  FilterRow,
  Editing,
  Popup,
  EmailRule,
  RequiredRule,
} from "devextreme-react/data-grid";
import notify from "devextreme/ui/notify";
import { AppDataGrid } from "../components/app-data-grid";
import { useAuth } from "../contexts/auth-hooks";
import { apiFetch } from "../api/client";
import { getDataGridErrorMessage } from "../utils/error-message";

const roleValues = [
  { value: "ADMIN", text: "Admin" },
  { value: "USER", text: "User" },
];

export default function UsersPage() {
  const { user } = useAuth();

  const dataSource = useMemo(
    () =>
      new CustomStore({
        key: "id",
        load: () => apiFetch("/api/users") as Promise<Record<string, unknown>[]>,
        insert: (values) =>
          apiFetch("/api/users", {
            method: "POST",
            body: JSON.stringify(values),
          }) as Promise<Record<string, unknown>>,
        update: (key, values) => {
          const payload = { ...(values as Record<string, unknown>) };
          delete payload.id;
          if (
            typeof payload.password === "string" &&
            payload.password.trim() === ""
          ) {
            delete payload.password;
          }
          return apiFetch(`/api/users/${key}`, {
            method: "PATCH",
            body: JSON.stringify(payload),
          }) as Promise<Record<string, unknown>>;
        },
        remove: (key) =>
          apiFetch(`/api/users/${key}`, { method: "DELETE" }) as Promise<void>,
      }),
    [],
  );

  if (user?.role !== "ADMIN") {
    return (
      <div className="content-block">
        <div className="page-toolbar">
          <h2>Users</h2>
        </div>
        <p>Administrator access is required to manage users.</p>
      </div>
    );
  }

  return (
    <div className="content-block content-block--fill">
      <div className="page-toolbar">
        <h2>Users</h2>
      </div>
      <div className="page-grid-body">
      <AppDataGrid
        persistenceKey="itm-grid-users"
        dataSource={dataSource}
        repaintChangesOnly
        height="100%"
        onEditorPreparing={(e) => {
          if (e.dataField !== "password" || e.parentType !== "dataRow") {
            return;
          }
          if (e.row && e.row.isNewRow === false) {
            e.cancel = true;
          }
        }}
        onDataErrorOccurred={(e) => {
          notify(getDataGridErrorMessage(e), "error", 5000);
        }}
      >
        <Editing allowAdding allowUpdating allowDeleting mode="popup" useIcons>
          <Popup title="User" showTitle width={520} height="auto" />
        </Editing>
        <FilterRow visible />
        <Column
          dataField="id"
          visible={false}
          allowEditing={false}
          formItem={{ visible: false }}
        />
        <Column dataField="email" width={220}>
          <RequiredRule />
          <EmailRule />
        </Column>
        <Column
          dataField="password"
          caption="Password"
          visible={false}
          editorOptions={{
            mode: "password",
            placeholder: "Required for new users (min 6 characters)",
          }}
        />
        <Column dataField="displayName" width={180}>
          <RequiredRule />
        </Column>
        <Column
          dataField="role"
          width={120}
          lookup={{
            dataSource: roleValues,
            valueExpr: "value",
            displayExpr: "text",
            allowSearch: true,
            allowClearing: true,
          }}
        >
          <RequiredRule />
        </Column>
        <Column
          dataField="createdAt"
          dataType="datetime"
          allowEditing={false}
          formItem={{ visible: false }}
        />
        <Column
          dataField="updatedAt"
          dataType="datetime"
          allowEditing={false}
          formItem={{ visible: false }}
        />
        <Paging defaultPageSize={20} />
        <Pager showPageSizeSelector showInfo />
      </AppDataGrid>
      </div>
    </div>
  );
}
