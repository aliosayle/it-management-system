import { useMemo } from "react";
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
import { getDataGridErrorMessage } from "../utils/error-message";

export default function CompaniesPage() {
  const dataSource = useMemo(
    () =>
      new CustomStore({
        key: "id",
        load: () => apiFetch("/api/companies") as Promise<Record<string, unknown>[]>,
        insert: (values) =>
          apiFetch("/api/companies", {
            method: "POST",
            body: JSON.stringify(values),
          }) as Promise<Record<string, unknown>>,
        update: (key, values) => {
          const payload = { ...(values as Record<string, unknown>) };
          delete payload.id;
          return apiFetch(`/api/companies/${key}`, {
            method: "PATCH",
            body: JSON.stringify(payload),
          }) as Promise<Record<string, unknown>>;
        },
        remove: (key) =>
          apiFetch(`/api/companies/${key}`, { method: "DELETE" }) as Promise<void>,
      }),
    [],
  );

  return (
    <div className="content-block content-block--fill">
      <div className="page-toolbar">
        <h2>Companies</h2>
      </div>
      <div className="page-grid-body">
      <AppDataGrid
        persistenceKey="itm-grid-companies"
        dataSource={dataSource}
        repaintChangesOnly
        height="100%"
        onDataErrorOccurred={(e) => {
          notify(getDataGridErrorMessage(e), "error", 5000);
        }}
      >
        <Editing allowAdding allowUpdating allowDeleting mode="popup" useIcons>
          <Popup title="Company" showTitle width={420} height="auto" />
        </Editing>
        <FilterRow visible />
        <Column
          dataField="id"
          visible={false}
          allowEditing={false}
          formItem={{ visible: false }}
        />
        <Column dataField="name" minWidth={200}>
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
