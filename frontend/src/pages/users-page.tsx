import { useMemo, useState } from "react";
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
  ColumnButton,
} from "devextreme-react/data-grid";
import notify from "devextreme/ui/notify";
import { AppDataGrid } from "../components/app-data-grid";
import { PageReadGuard } from "../components/require-page-access";
import { UserPermissionsMatrix } from "../components/user-permissions-matrix";
import { useAuth } from "../contexts/auth-hooks";
import { usePagePermissions } from "../hooks/use-permissions";
import { apiFetch } from "../api/client";
import { getDataGridErrorMessage } from "../utils/error-message";

const roleValues = [
  { value: "ADMIN", text: "Admin" },
  { value: "USER", text: "User" },
];

export default function UsersPage() {
  const { user } = useAuth();
  const { canAdd, canEdit, canDelete } = usePagePermissions("users");
  const isAdmin = user?.role === "ADMIN";
  const [matrixUserId, setMatrixUserId] = useState<string | null>(null);
  const [matrixUserLabel, setMatrixUserLabel] = useState("");

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

  return (
    <PageReadGuard resource="users">
      <div className="content-block content-block--fill">
        <div className="page-toolbar">
          <h2>Users</h2>
        </div>
        <div className="page-grid-body">
          <AppDataGrid
            permissionResource="users"
            persistenceKey="itm-grid-users"
            dataSource={dataSource}
            repaintChangesOnly
            height="100%"
            onEditorPreparing={(e) => {
              if (e.parentType !== "dataRow") {
                return;
              }
              if (e.dataField === "password" && e.row && e.row.isNewRow === false) {
                e.cancel = true;
              }
              if (e.dataField === "role" && !isAdmin) {
                e.cancel = true;
              }
            }}
            onDataErrorOccurred={(e) => {
              notify(getDataGridErrorMessage(e), "error", 5000);
            }}
          >
            <Editing
              allowAdding={canAdd}
              allowUpdating={canEdit}
              allowDeleting={canDelete}
              mode="popup"
              useIcons
            >
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
              allowEditing={isAdmin}
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
            {isAdmin ? (
              <Column type="buttons" width={56}>
                <ColumnButton
                  hint="Page permissions"
                  icon="preferences"
                  disabled={false}
                  onClick={(e) => {
                    const row = e.row?.data as Record<string, unknown> | undefined;
                    if (!row?.id || row.role === "ADMIN") {
                      if (row?.role === "ADMIN") {
                        notify("Administrator accounts have full access.", "info", 3000);
                      }
                      return;
                    }
                    setMatrixUserId(String(row.id));
                    setMatrixUserLabel(
                      String(row.displayName ?? row.email ?? row.id),
                    );
                  }}
                />
              </Column>
            ) : null}
            <Paging defaultPageSize={20} />
            <Pager showPageSizeSelector showInfo />
          </AppDataGrid>
        </div>

        <UserPermissionsMatrix
          userId={matrixUserId ?? ""}
          userLabel={matrixUserLabel}
          open={Boolean(matrixUserId)}
          onClose={() => setMatrixUserId(null)}
        />
      </div>
    </PageReadGuard>
  );
}
