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
  ColumnButton,
} from "devextreme-react/data-grid";
import notify from "devextreme/ui/notify";
import { AppDataGrid } from "../components/app-data-grid";
import {
  PersonnelBinPopup,
  type ProductOption,
} from "../components/personnel-bin-popup";
import { apiFetch } from "../api/client";

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
        notify(e instanceof Error ? e.message : "Failed to load options", "error", 4000);
      }
    })();
  }, [loadFormMeta]);

  const dataSource = useMemo(
    () =>
      new CustomStore({
        key: "id",
        load: () => apiFetch("/api/personnel") as Promise<Record<string, unknown>[]>,
        insert: (values) => {
          const payload = { ...(values as Record<string, unknown>) };
          delete payload.fullName;
          delete payload.siteLabel;
          delete payload.userEmail;
          delete payload.userId;
          return apiFetch("/api/personnel", {
            method: "POST",
            body: JSON.stringify(payload),
          }) as Promise<Record<string, unknown>>;
        },
        update: (key, values) => {
          const payload = { ...(values as Record<string, unknown>) };
          delete payload.id;
          delete payload.fullName;
          delete payload.siteLabel;
          delete payload.userEmail;
          delete payload.userId;
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
            notify(err instanceof Error ? err.message : "Failed to load form options", "error", 4000);
          });
        }}
        onInitNewRow={() => {
          loadFormMeta().catch((err: unknown) => {
            notify(err instanceof Error ? err.message : "Failed to load form options", "error", 4000);
          });
        }}
        onDataErrorOccurred={(e) => {
          notify((e.error as Error)?.message || "Request failed", "error", 4000);
        }}
      >
        <Editing allowAdding allowUpdating allowDeleting mode="popup" useIcons>
          <Popup title="Personnel" showTitle width={520} height="auto" />
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
        <Column dataField="email" />
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
          dataField="siteLabel"
          caption="Site"
          allowEditing={false}
          formItem={{ visible: false }}
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
        <Column type="buttons" width={100}>
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
