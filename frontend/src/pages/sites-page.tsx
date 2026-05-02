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
import { SiteBinPopup, type ProductOption } from "../components/site-bin-popup";
import { apiFetch } from "../api/client";
import { getDataGridErrorMessage, getErrorMessage } from "../utils/error-message";

type Company = { id: string; name: string };

export default function SitesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [binOpen, setBinOpen] = useState(false);
  const [binSiteId, setBinSiteId] = useState<string | null>(null);
  const [binSiteTitle, setBinSiteTitle] = useState("");
  const [binProducts, setBinProducts] = useState<ProductOption[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const list = (await apiFetch("/api/companies")) as Company[];
        setCompanies(list);
      } catch (e: unknown) {
        notify(getErrorMessage(e, "Failed to load companies"), "error", 5000);
      }
    })();
  }, []);

  useEffect(() => {
    if (!binOpen) {
      return;
    }
    (async () => {
      try {
        const rows = (await apiFetch("/api/products")) as { id: string; sku: string; name: string }[];
        setBinProducts(
          rows.map((p) => ({
            id: p.id,
            sku: p.sku,
            name: p.name,
            label: `${p.sku} — ${p.name}`,
          })),
        );
      } catch (e: unknown) {
        notify(getErrorMessage(e, "Failed to load products for bin"), "error", 5000);
      }
    })();
  }, [binOpen]);

  const openSiteBin = useCallback((row: Record<string, unknown>) => {
    const id = typeof row.id === "string" ? row.id : null;
    const label = typeof row.label === "string" ? row.label : "";
    if (!id) return;
    setBinSiteId(id);
    setBinSiteTitle(label || id);
    setBinOpen(true);
  }, []);

  const closeSiteBin = useCallback(() => {
    setBinOpen(false);
    setBinSiteId(null);
    setBinSiteTitle("");
  }, []);

  const dataSource = useMemo(
    () =>
      new CustomStore({
        key: "id",
        load: () => apiFetch("/api/sites") as Promise<Record<string, unknown>[]>,
        insert: (values) =>
          apiFetch("/api/sites", {
            method: "POST",
            body: JSON.stringify(values),
          }) as Promise<Record<string, unknown>>,
        update: (key, values) => {
          const payload = { ...(values as Record<string, unknown>) };
          delete payload.id;
          delete payload.label;
          delete payload.companyName;
          return apiFetch(`/api/sites/${key}`, {
            method: "PATCH",
            body: JSON.stringify(payload),
          }) as Promise<Record<string, unknown>>;
        },
        remove: (key) =>
          apiFetch(`/api/sites/${key}`, { method: "DELETE" }) as Promise<void>,
      }),
    [],
  );

  return (
    <div className="content-block content-block--fill">
      <div className="page-toolbar">
        <h2>Sites</h2>
      </div>
      <div className="page-grid-body">
      <AppDataGrid
        persistenceKey="itm-grid-sites"
        dataSource={dataSource}
        repaintChangesOnly
        height="100%"
        onDataErrorOccurred={(e) => {
          notify(getDataGridErrorMessage(e), "error", 5000);
        }}
      >
        <Editing allowAdding allowUpdating allowDeleting mode="popup" useIcons>
          <Popup title="Site" showTitle width={480} height="auto" />
        </Editing>
        <FilterRow visible />
        <Column
          dataField="id"
          visible={false}
          allowEditing={false}
          formItem={{ visible: false }}
        />
        <Column
          dataField="companyId"
          caption="Company"
          width={220}
          lookup={{
            dataSource: companies,
            valueExpr: "id",
            displayExpr: "name",
            allowSearch: true,
            allowClearing: true,
          }}
        >
          <RequiredRule />
        </Column>
        <Column dataField="name" minWidth={180}>
          <RequiredRule />
        </Column>
        <Column
          dataField="label"
          caption="Full label"
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
        <Column type="buttons" width={140}>
          <ColumnButton name="edit" />
          <ColumnButton
            hint="Site bin — equipment and consumables at this location"
            icon="box"
            onClick={(e) => {
              if (e.row?.isNewRow) {
                return;
              }
              const row = e.row?.data as Record<string, unknown> | undefined;
              if (row) {
                openSiteBin(row);
              }
            }}
          />
          <ColumnButton name="delete" />
        </Column>
        <Paging defaultPageSize={20} />
        <Pager showPageSizeSelector showInfo />
      </AppDataGrid>
      </div>

      <SiteBinPopup
        visible={binOpen}
        siteId={binSiteId}
        title={binSiteTitle}
        products={binProducts}
        onClose={closeSiteBin}
      />
    </div>
  );
}
