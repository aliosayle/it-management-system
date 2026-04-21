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
import PopupDx from "devextreme-react/popup";
import notify from "devextreme/ui/notify";
import { AppDataGrid } from "./app-data-grid";
import { apiFetch } from "../api/client";

export type ProductOption = { id: string; sku: string; name: string; label: string };

type Props = {
  visible: boolean;
  personnelId: string | null;
  title: string;
  products: ProductOption[];
  onClose: () => void;
};

export function PersonnelBinPopup({
  visible,
  personnelId,
  title,
  products,
  onClose,
}: Props) {
  const dataSource = useMemo(() => {
    if (!personnelId) {
      return new CustomStore({ key: "id", load: () => Promise.resolve([]) });
    }
    return new CustomStore({
      key: "id",
      load: () =>
        apiFetch(`/api/personnel/${personnelId}/bin/items`) as Promise<
          Record<string, unknown>[]
        >,
      insert: (values) =>
        apiFetch(`/api/personnel/${personnelId}/bin/items`, {
          method: "POST",
          body: JSON.stringify({
            productId: (values as { productId: string }).productId,
            quantity: (values as { quantity: number }).quantity,
            note: (values as { note?: string | null }).note ?? null,
          }),
        }) as Promise<Record<string, unknown>>,
      update: (key, values) => {
        const payload = values as { quantity?: number; note?: string | null };
        return apiFetch(`/api/personnel/${personnelId}/bin/items/${key}`, {
          method: "PATCH",
          body: JSON.stringify({
            quantity: payload.quantity,
            note: payload.note ?? null,
          }),
        }) as Promise<Record<string, unknown>>;
      },
      remove: (key) =>
        apiFetch(`/api/personnel/${personnelId}/bin/items/${key}`, {
          method: "DELETE",
        }) as Promise<void>,
    });
  }, [personnelId]);

  return (
    <PopupDx
      visible={visible}
      onHiding={onClose}
      showTitle
      title={`Personal bin — ${title}`}
      width={1100}
      height={620}
      showCloseButton
    >
      <AppDataGrid
        key={personnelId ?? "none"}
        className="personnel-bin-grid"
        dataSource={dataSource}
        persistenceKey={`itm-bin-${personnelId ?? "none"}`}
        repaintChangesOnly
        height={480}
        onEditorPreparing={(e) => {
          if (e.dataField === "productId" && e.parentType === "dataRow" && e.row?.isNewRow === false) {
            e.cancel = true;
          }
        }}
        onDataErrorOccurred={(e) => {
          notify((e.error as Error)?.message || "Request failed", "error", 4000);
        }}
      >
        <Editing allowAdding allowUpdating allowDeleting mode="popup" useIcons>
          <Popup title="Bin line" showTitle width={720} height="auto" />
        </Editing>
        <FilterRow visible />
        <Column
          dataField="id"
          visible={false}
          allowEditing={false}
          formItem={{ visible: false }}
        />
        <Column
          dataField="productId"
          caption="Product"
          width={240}
          lookup={{
            dataSource: products,
            valueExpr: "id",
            displayExpr: "label",
            allowSearch: true,
            allowClearing: true,
          }}
        >
          <RequiredRule />
        </Column>
        <Column
          dataField="productSku"
          caption="SKU"
          allowEditing={false}
          formItem={{ visible: false }}
        />
        <Column
          dataField="productName"
          caption="Product name"
          allowEditing={false}
          formItem={{ visible: false }}
        />
        <Column dataField="quantity" dataType="number">
          <RequiredRule />
        </Column>
        <Column dataField="note" />
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
    </PopupDx>
  );
}
