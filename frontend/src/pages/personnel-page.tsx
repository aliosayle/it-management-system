import { useCallback, useEffect, useMemo, useState } from "react";
import CustomStore from "devextreme/data/custom_store";
import {
  Column,
  Paging,
  Pager,
  FilterRow,
  Editing,
  Popup,
  RequiredRule,
  EmailRule,
  ColumnButton,
} from "devextreme-react/data-grid";
import PopupDx from "devextreme-react/popup";
import notify from "devextreme/ui/notify";
import { AppDataGrid } from "../components/app-data-grid";
import { apiFetch } from "../api/client";
import { getDataGridErrorMessage, getErrorMessage } from "../utils/error-message";

type FormMeta = {
  sites: { id: string; label: string }[];
  users: { id: string; email: string; displayName: string }[];
};

function toPersonnelSavePayload(row: Record<string, unknown>): Record<string, unknown> {
  const p = { ...row };
  delete p.fullName;
  delete p.siteLabel;
  delete p.userEmail;
  delete p.createdAt;
  delete p.updatedAt;
  if (typeof p.email === "string" && p.email.trim() === "") {
    p.email = null;
  }
  if (typeof p.phone === "string" && p.phone.trim() === "") {
    p.phone = null;
  }
  if (p.userId === "" || p.userId === undefined) {
    p.userId = null;
  }
  return p;
}

function formatWhen(value: unknown): string {
  if (value == null || value === "") {
    return "—";
  }
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString();
}

export default function PersonnelPage() {
  const [meta, setMeta] = useState<FormMeta | null>(null);
  const [viewOpen, setViewOpen] = useState(false);
  const [viewRow, setViewRow] = useState<Record<string, unknown> | null>(null);

  const loadFormMeta = useCallback(async (personnelId?: string) => {
    const qs =
      personnelId && personnelId.length > 0
        ? `?personnelId=${encodeURIComponent(personnelId)}`
        : "";
    const m = (await apiFetch(`/api/personnel/form-meta${qs}`)) as FormMeta;
    setMeta(m);
  }, []);

  useEffect(() => {
    loadFormMeta().catch((e: unknown) => {
      notify(getErrorMessage(e, "Failed to load options"), "error", 5000);
    });
  }, [loadFormMeta]);

  const userLookupRows = useMemo(
    () =>
      (meta?.users ?? []).map((u) => ({
        ...u,
        label: `${u.displayName} (${u.email})`,
      })),
    [meta],
  );

  const dataSource = useMemo(
    () =>
      new CustomStore({
        key: "id",
        load: () => apiFetch("/api/personnel") as Promise<Record<string, unknown>[]>,
        insert: (values) =>
          apiFetch("/api/personnel", {
            method: "POST",
            body: JSON.stringify(toPersonnelSavePayload(values as Record<string, unknown>)),
          }) as Promise<Record<string, unknown>>,
        update: (key, values) => {
          const payload = toPersonnelSavePayload(values as Record<string, unknown>);
          delete payload.id;
          return apiFetch(`/api/personnel/${key}`, {
            method: "PATCH",
            body: JSON.stringify(payload),
          }) as Promise<Record<string, unknown>>;
        },
        remove: (key) =>
          apiFetch(`/api/personnel/${key}`, { method: "DELETE" }) as Promise<void>,
      }),
    [],
  );

  const openView = useCallback((row: Record<string, unknown>) => {
    setViewRow(row);
    setViewOpen(true);
  }, []);

  /** Use contentRender so markup mounts in the popup template DOM, not the portal+display:contents path that leaks into the page flex layout under the grid. */
  const renderViewPopupContent = useCallback(() => {
    if (!viewRow) {
      return <div />;
    }
    const row = viewRow;
    return (
      <div
        className="personnel-view-readonly"
        style={{ fontSize: 14, lineHeight: 1.55, color: "var(--base-text-color, #111)" }}
      >
        <div>
          <strong>Name</strong>{" "}
          {(row.fullName as string) ||
            `${String(row.firstName ?? "")} ${String(row.lastName ?? "")}`.trim() ||
            "—"}
        </div>
        <div>
          <strong>Email</strong> {String(row.email ?? "—")}
        </div>
        <div>
          <strong>Phone</strong> {String(row.phone ?? "—")}
        </div>
        <div>
          <strong>Site</strong> {String(row.siteLabel ?? "—")}
        </div>
        <div>
          <strong>Linked app user</strong> {String(row.userEmail ?? "—")}
        </div>
        <div>
          <strong>Can authorize purchases</strong> {row.canAuthorizePurchases ? "Yes" : "No"}
        </div>
        <div>
          <strong>Buyer (purchases)</strong> {row.isBuyer ? "Yes" : "No"}
        </div>
        <div>
          <strong>Created</strong> {formatWhen(row.createdAt)}
        </div>
        <div>
          <strong>Updated</strong> {formatWhen(row.updatedAt)}
        </div>
      </div>
    );
  }, [viewRow]);

  return (
    <div className="content-block content-block--fill">
      <div className="page-toolbar">
        <h2>Personnel</h2>
      </div>
      <div className="page-grid-body">
        <AppDataGrid
          persistenceKey="itm-grid-personnel-v3"
          dataSource={dataSource}
          repaintChangesOnly
          height="100%"
          onEditingStart={(e) => {
            const id = (e.data as { id?: string })?.id;
            loadFormMeta(id).catch((err: unknown) => {
              notify(getErrorMessage(err, "Failed to load form options"), "error", 5000);
            });
          }}
          onInitNewRow={(e) => {
            const d = e.data as { canAuthorizePurchases?: boolean; isBuyer?: boolean };
            d.canAuthorizePurchases = false;
            d.isBuyer = false;
            loadFormMeta().catch((err: unknown) => {
              notify(getErrorMessage(err, "Failed to load form options"), "error", 5000);
            });
          }}
          onDataErrorOccurred={(e) => {
            notify(getDataGridErrorMessage(e), "error", 5000);
          }}
        >
          <Editing allowAdding allowUpdating allowDeleting mode="popup" useIcons>
            <Popup title="Personnel" showTitle width={640} height="auto" />
          </Editing>
          <FilterRow visible />
          <Column
            dataField="id"
            visible={false}
            allowEditing={false}
            formItem={{ visible: false }}
          />
          <Column dataField="firstName" width={130}>
            <RequiredRule />
          </Column>
          <Column dataField="lastName" width={130}>
            <RequiredRule />
          </Column>
          <Column
            dataField="fullName"
            caption="Full name"
            allowEditing={false}
            formItem={{ visible: false }}
          />
          <Column dataField="email" width={220}>
            <EmailRule ignoreEmptyValue />
          </Column>
          <Column dataField="phone" />
          <Column
            dataField="siteId"
            caption="Site"
            width={240}
            lookup={{
              dataSource: meta?.sites ?? [],
              valueExpr: "id",
              displayExpr: "label",
              allowSearch: true,
              allowClearing: true,
            }}
          >
            <RequiredRule />
          </Column>
          <Column
            dataField="userId"
            caption="Linked app user"
            visible={false}
            lookup={{
              dataSource: userLookupRows,
              valueExpr: "id",
              displayExpr: "label",
              allowSearch: true,
              allowClearing: true,
            }}
          />
          <Column
            dataField="canAuthorizePurchases"
            caption="Can authorize purchases"
            dataType="boolean"
            visible={false}
          />
          <Column dataField="isBuyer" caption="Buyer (purchases)" dataType="boolean" visible={false} />
          <Column
            dataField="createdAt"
            caption="Created"
            dataType="datetime"
            visible={false}
            allowEditing={false}
            formItem={{
              editorType: "dxTextBox",
              editorOptions: { readOnly: true },
            }}
          />
          <Column
            dataField="updatedAt"
            caption="Updated"
            dataType="datetime"
            visible={false}
            allowEditing={false}
            formItem={{
              editorType: "dxTextBox",
              editorOptions: { readOnly: true },
            }}
          />
          <Column type="buttons" width={120}>
            <ColumnButton name="edit" />
            <ColumnButton
              hint="View"
              icon="eyeopen"
              text="View"
              onClick={(e) => {
                if (e.row?.isNewRow) {
                  return;
                }
                const row = e.row?.data as Record<string, unknown> | undefined;
                if (row) {
                  openView(row);
                }
              }}
            />
            <ColumnButton name="delete" />
          </Column>
          <Paging defaultPageSize={20} />
          <Pager showPageSizeSelector showInfo />
        </AppDataGrid>
      </div>

      <PopupDx
        visible={viewOpen}
        onHiding={() => {
          setViewOpen(false);
          setViewRow(null);
        }}
        showTitle
        title="Personnel"
        width={640}
        height="auto"
        showCloseButton
        contentRender={renderViewPopupContent}
      />
    </div>
  );
}
