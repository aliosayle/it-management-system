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

/** Remove grid-only / mirrored fields; normalize empty strings for the API. */
function toPersonnelSavePayload(row: Record<string, unknown>): Record<string, unknown> {
  const p = { ...row };
  delete p.fullName;
  delete p.siteLabel;
  delete p.userEmail;
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
import notify from "devextreme/ui/notify";
import { AppDataGrid } from "../components/app-data-grid";
import {
  PersonnelBinPopup,
  type ProductOption,
} from "../components/personnel-bin-popup";
import { apiFetch } from "../api/client";
import { getDataGridErrorMessage, getErrorMessage } from "../utils/error-message";

type FormMeta = {
  sites: { id: string; label: string }[];
  users: { id: string; email: string; displayName: string }[];
};

export default function PersonnelPage() {
  const [meta, setMeta] = useState<FormMeta | null>(null);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [binOpen, setBinOpen] = useState(false);
  const [binPersonnelId, setBinPersonnelId] = useState<string | null>(null);
  const [binTitle, setBinTitle] = useState("");

  const loadFormMeta = useCallback(async (personnelId?: string) => {
    const qs =
      personnelId && personnelId.length > 0
        ? `?personnelId=${encodeURIComponent(personnelId)}`
        : "";
    const m = (await apiFetch(`/api/personnel/form-meta${qs}`)) as FormMeta;
    setMeta(m);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await loadFormMeta();
        const plist = (await apiFetch("/api/products")) as {
          id: string;
          sku: string;
          name: string;
        }[];
        setProducts(
          plist.map((p) => ({
            id: p.id,
            sku: p.sku,
            name: p.name,
            label: `${p.sku} — ${p.name}`,
          })),
        );
      } catch (e: unknown) {
        notify(getErrorMessage(e, "Failed to load options"), "error", 5000);
      }
    })();
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

  const openBin = useCallback((row: Record<string, unknown>) => {
    const id = row.id as string;
    const name = (row.fullName as string) || `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim();
    setBinPersonnelId(id);
    setBinTitle(name || id);
    setBinOpen(true);
  }, []);

  return (
    <div className="content-block content-block--fill">
      <div className="page-toolbar">
        <h2>Personnel</h2>
      </div>
      <div className="page-grid-body">
      <AppDataGrid
        persistenceKey="itm-grid-personnel"
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
          (e.data as { canAuthorizePurchases?: boolean }).canAuthorizePurchases = false;
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
        <Column dataField="fullName" caption="Full name" allowEditing={false} formItem={{ visible: false }} />
        <Column dataField="email" width={220}>
          <EmailRule ignoreEmptyValue />
        </Column>
        <Column dataField="phone" />
        <Column
          dataField="userId"
          caption="Linked app user"
          width={260}
          lookup={{
            dataSource: userLookupRows,
            valueExpr: "id",
            displayExpr: "label",
            allowSearch: true,
            allowClearing: true,
          }}
        />
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
          dataField="canAuthorizePurchases"
          caption="Authorize purchases"
          dataType="boolean"
          width={130}
        />
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
        <Column type="buttons" width={160}>
          <ColumnButton name="edit" />
          <ColumnButton name="delete" />
          <ColumnButton
            hint="View personal bin"
            icon="box"
            text="Bin"
            onClick={(e) => {
              const row = e.row?.data as Record<string, unknown> | undefined;
              if (row) {
                openBin(row);
              }
            }}
          />
        </Column>
        <Paging defaultPageSize={20} />
        <Pager showPageSizeSelector showInfo />
      </AppDataGrid>
      </div>

      <PersonnelBinPopup
        visible={binOpen}
        personnelId={binPersonnelId}
        title={binTitle}
        products={products}
        onClose={() => {
          setBinOpen(false);
          setBinPersonnelId(null);
        }}
      />
    </div>
  );
}
