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
  ColumnButton,
} from "devextreme-react/data-grid";
import notify from "devextreme/ui/notify";
import { AppDataGrid } from "../components/app-data-grid";
import { apiFetch } from "../api/client";
import { getDataGridErrorMessage, getErrorMessage } from "../utils/error-message";

type SiteOpt = { id: string; label: string };

export default function DepartmentsPage() {
  const [sites, setSites] = useState<SiteOpt[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const rows = (await apiFetch("/api/sites")) as Array<{ id: string; label: string }>;
        setSites(rows.map((s) => ({ id: s.id, label: s.label })));
      } catch (e: unknown) {
        notify(getErrorMessage(e, "Failed to load sites"), "error", 5000);
      }
    })();
  }, []);

  const dataSource = useMemo(
    () =>
      new CustomStore({
        key: "id",
        load: () => apiFetch("/api/departments") as Promise<Record<string, unknown>[]>,
        insert: (values) =>
          apiFetch("/api/departments", {
            method: "POST",
            body: JSON.stringify(values),
          }) as Promise<Record<string, unknown>>,
        update: (key, values) => {
          const payload = { ...(values as Record<string, unknown>) };
          delete payload.id;
          delete payload.siteLabel;
          delete payload.label;
          delete payload.companyName;
          delete payload.siteName;
          return apiFetch(`/api/departments/${key}`, {
            method: "PATCH",
            body: JSON.stringify(payload),
          }) as Promise<Record<string, unknown>>;
        },
        remove: (key) =>
          apiFetch(`/api/departments/${key}`, { method: "DELETE" }) as Promise<void>,
      }),
    [],
  );

  return (
    <div className="content-block content-block--fill">
      <div className="page-toolbar">
        <h2>Departments</h2>
      </div>
      <p className="purchase-form__hint" style={{ margin: "0 0 12px" }}>
        Departments belong to a site. You can tag purchase line items with a department for cost allocation.
      </p>
      <div className="page-grid-body">
        <AppDataGrid
          persistenceKey="itm-grid-departments"
          dataSource={dataSource}
          repaintChangesOnly
          height="100%"
          onDataErrorOccurred={(e) => {
            notify(getDataGridErrorMessage(e), "error", 5000);
          }}
        >
          <Editing allowAdding allowUpdating allowDeleting mode="popup" useIcons>
            <Popup title="Department" showTitle width={480} height="auto" />
          </Editing>
          <FilterRow visible />
          <Column
            dataField="id"
            visible={false}
            allowEditing={false}
            formItem={{ visible: false }}
          />
          <Column
            dataField="siteId"
            caption="Site"
            width={260}
            lookup={{
              dataSource: sites,
              valueExpr: "id",
              displayExpr: "label",
              allowSearch: true,
              allowClearing: true,
            }}
          >
            <RequiredRule />
          </Column>
          <Column dataField="name" minWidth={200}>
            <RequiredRule />
          </Column>
          <Column
            dataField="siteLabel"
            caption="Site (read-only)"
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
            <ColumnButton name="edit" />
            <ColumnButton name="delete" />
          </Column>
          <Paging defaultPageSize={20} />
          <Pager showPageSizeSelector showInfo />
        </AppDataGrid>
      </div>
    </div>
  );
}
