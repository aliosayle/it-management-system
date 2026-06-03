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
              if (e.dataField === "password") {
                e.editorOptions = {
                  ...e.editorOptions,
                  mode: "password",
                  placeholder: e.row?.isNewRow
                    ? "Required for new users (min 6 characters)"
                    : "Leave blank to keep current password",
                };
              }
              if (e.dataField === "role" && !isAdmin) {
                e.cancel = true;
              }
            }}
            onInitNewRow={(e) => {
              const d = e.data as { password?: string };
              d.password = "";
            }}
            onRowValidating={(e) => {
              const password = (e.newData as { password?: string }).password;
              const trimmed =
                typeof password === "string" ? password.trim() : "";
              const isNewRow = !(e.oldData as { id?: string } | undefined)?.id;
              if (isNewRow) {
                if (trimmed.length < 6) {
                  e.errorText = "Password is required for new users (min 6 characters).";
                  e.isValid = false;
                  return;
                }
              } else if (trimmed.length > 0 && trimmed.length < 6) {
                e.errorText = "New password must be at least 6 characters.";
                e.isValid = false;
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
              allowFiltering={false}
              allowSorting={false}
              formItem={{
                visible: true,
                helpText: "On edit, leave empty to keep the existing password.",
              }}
              editorOptions={{
                mode: "password",
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
            <Column type="buttons" width={isAdmin ? 150 : 88}>
              <ColumnButton name="edit" disabled={!canEdit} />
              <ColumnButton name="delete" disabled={!canDelete} />
              {isAdmin ? (
                <ColumnButton
                  hint="Page permissions"
                  icon="key"
                  text="Permissions"
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
              ) : null}
            </Column>
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
