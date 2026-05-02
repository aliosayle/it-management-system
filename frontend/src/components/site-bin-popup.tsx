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
import { getDataGridErrorMessage } from "../utils/error-message";

export type ProductOption = { id: string; sku: string; name: string; label: string };

type Props = {
  visible: boolean;
  siteId: string | null;
  title: string;
  products: ProductOption[];
  onClose: () => void;
};

export function SiteBinPopup({ visible, siteId, title, products, onClose }: Props) {
  const dataSource = useMemo(() => {
    if (!siteId) {
      return new CustomStore({ key: "id", load: () => Promise.resolve([]) });
    }
    return new CustomStore({
      key: "id",
      load: () =>
        apiFetch(`/api/sites/${siteId}/bin/items`) as Promise<Record<string, unknown>[]>,
      insert: (values) =>
        apiFetch(`/api/sites/${siteId}/bin/items`, {
          method: "POST",
          body: JSON.stringify({
            productId: (values as { productId: string }).productId,
            quantity: (values as { quantity: number }).quantity,
            note: (values as { note?: string | null }).note ?? null,
          }),
        }) as Promise<Record<string, unknown>>,
      update: (key, values) => {
        const payload = values as { quantity?: number; note?: string | null };
        return apiFetch(`/api/sites/${siteId}/bin/items/${key}`, {
          method: "PATCH",
          body: JSON.stringify({
            quantity: payload.quantity,
            note: payload.note ?? null,
          }),
        }) as Promise<Record<string, unknown>>;
      },
      remove: (key) =>
        apiFetch(`/api/sites/${siteId}/bin/items/${key}`, {
          method: "DELETE",
        }) as Promise<void>,
    });
  }, [siteId]);

  return (
    <PopupDx
      visible={visible}
      onHiding={onClose}
      showTitle
      title={`Site bin — ${title}`}
      width={1100}
      height={620}
      showCloseButton
    >
      <AppDataGrid
        key={siteId ?? "none"}
        className="site-bin-grid"
        dataSource={dataSource}
        persistenceKey={`itm-site-bin-${siteId ?? "none"}`}
        repaintChangesOnly
        height={480}
        onEditorPreparing={(e) => {
          if (e.dataField === "productId" && e.parentType === "dataRow" && e.row?.isNewRow === false) {
            e.cancel = true;
          }
        }}
        onDataErrorOccurred={(e) => {
          notify(getDataGridErrorMessage(e), "error", 5000);
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
          dataField="typeLabel"
          caption="Type"
          width={90}
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
