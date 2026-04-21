import { useEffect, useMemo, useState } from "react";
import CustomStore from "devextreme/data/custom_store";
import {
  Column,
  Paging,
  Pager,
  FilterRow,
  Editing,
  Popup,
  RequiredRule,
} from "devextreme-react/data-grid";
import notify from "devextreme/ui/notify";
import { AppDataGrid } from "../components/app-data-grid";
import { apiFetch } from "../api/client";
import { getDataGridErrorMessage, getErrorMessage } from "../utils/error-message";

type Company = { id: string; name: string };

export default function SitesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);

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
        <Paging defaultPageSize={20} />
        <Pager showPageSizeSelector showInfo />
      </AppDataGrid>
      </div>
    </div>
  );
}
