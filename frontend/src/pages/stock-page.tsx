import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CustomStore from "devextreme/data/custom_store";
import {
  Column,
  Paging,
  Pager,
  FilterRow,
  type DataGridRef,
} from "devextreme-react/data-grid";
import { AppDataGrid } from "../components/app-data-grid";
import SelectBox from "devextreme-react/select-box";
import Button from "devextreme-react/button";
import Popup from "devextreme-react/popup";
import Form, { Item, Label, RequiredRule } from "devextreme-react/form";
import notify from "devextreme/ui/notify";
import type { FormTypes } from "devextreme-react/form";
import { apiFetch } from "../api/client";
import {
  MOVEMENT_TYPE_OPTIONS,
  type MovementTypeValue,
  movementTypeLabel,
} from "../constants/movement-types";

type Product = {
  id: string;
  sku: string;
  name: string;
  quantityOnHand: number;
};

type MovementRow = {
  id: string;
  type: string;
  quantity: number;
  balanceAfter: number;
  note: string | null;
  purchaseId: string | null;
  createdAt: string;
  user?: { displayName: string; email: string };
};

export default function StockPage() {
  const gridRef = useRef<DataGridRef>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [productId, setProductId] = useState<string | null>(null);
  const [popupOpen, setPopupOpen] = useState(false);
  const [movementForm, setMovementForm] = useState({
    type: "IN" as MovementTypeValue,
    quantity: 1,
    note: "",
  });

  const loadProducts = useCallback(async () => {
    const list = (await apiFetch("/api/products")) as Product[];
    setProducts(list);
    setProductId((prev) => prev ?? list[0]?.id ?? null);
  }, []);

  useEffect(() => {
    loadProducts().catch((e: unknown) => {
      notify(e instanceof Error ? e.message : "Failed to load products", "error", 4000);
    });
  }, [loadProducts]);

  const movementsStore = useMemo(() => {
    if (!productId) {
      return new CustomStore({
        key: "id",
        load: () => Promise.resolve({ data: [], totalCount: 0 }),
      });
    }
    return new CustomStore({
      key: "id",
      load: async (loadOptions) => {
        const skip = loadOptions.skip ?? 0;
        const take = loadOptions.take ?? 50;
        const res = (await apiFetch(
          `/api/products/${productId}/movements?skip=${skip}&take=${take}`,
        )) as {
          items: MovementRow[];
          total: number;
        };
        return { data: res.items, totalCount: res.total };
      },
    });
  }, [productId]);

  const onProductChange = useCallback((e: { value?: string | null }) => {
    setProductId(e.value ?? null);
  }, []);

  const onMovementFieldChanged = useCallback((e: FormTypes.FieldDataChangedEvent) => {
    const { dataField, value } = e;
    if (!dataField) return;
    setMovementForm((prev) => ({ ...prev, [dataField]: value }));
  }, []);

  const submitMovement = useCallback(async () => {
    if (!productId) {
      notify("Select a product", "warning", 2000);
      return;
    }
    try {
      await apiFetch("/api/stock/movements", {
        method: "POST",
        body: JSON.stringify({
          productId,
          type: movementForm.type,
          quantity: movementForm.quantity,
          note: movementForm.note || null,
        }),
      });
      notify("Movement saved", "success", 2000);
      setPopupOpen(false);
      setMovementForm({ type: "IN", quantity: 1, note: "" });
      await loadProducts();
      gridRef.current?.instance().refresh();
    } catch (e: unknown) {
      notify(e instanceof Error ? e.message : "Failed to save", "error", 4000);
    }
  }, [productId, movementForm, loadProducts]);

  const selectedProduct = products.find((p) => p.id === productId);

  return (
    <div className="content-block content-block--fill">
      <div className="stock-toolbar">
        <h2 style={{ margin: 0, marginRight: 8 }}>Stock</h2>
        <div className="stock-toolbar__grow">
          <SelectBox
            dataSource={products}
            displayExpr="name"
            valueExpr="id"
            value={productId}
            onValueChanged={onProductChange}
            searchEnabled
            placeholder="Product"
          />
        </div>
        {selectedProduct ? (
          <span className="stock-toolbar__meta">
            {selectedProduct.sku} · on hand {selectedProduct.quantityOnHand}
          </span>
        ) : null}
        <Button
          text="New movement"
          type="default"
          stylingMode="contained"
          onClick={() => setPopupOpen(true)}
          disabled={!productId}
        />
      </div>

      <div className="page-grid-body">
        <AppDataGrid
          ref={gridRef}
          className="stock-movements-grid"
          persistenceKey="itm-grid-stock-movements"
          dataSource={movementsStore}
          remoteOperations={{ paging: true }}
          height="100%"
        >
          <FilterRow visible />
          <Column dataField="createdAt" dataType="datetime" caption="When" />
          <Column
            dataField="type"
            caption="Type"
            width={200}
            calculateCellValue={(row: MovementRow) => movementTypeLabel(row.type)}
          />
          <Column dataField="quantity" dataType="number" />
          <Column dataField="balanceAfter" caption="Balance after" dataType="number" />
          <Column dataField="purchaseId" caption="Purchase" width={120} />
          <Column dataField="note" />
          <Column
            caption="User"
            calculateCellValue={(row: MovementRow) =>
              row.user?.displayName || row.user?.email || ""
            }
          />
          <Paging defaultPageSize={20} />
          <Pager showPageSizeSelector showInfo />
        </AppDataGrid>
      </div>

      <Popup
        visible={popupOpen}
        onHiding={() => setPopupOpen(false)}
        showTitle
        title="Stock movement"
        width={440}
        height="auto"
        showCloseButton
      >
        <Form formData={movementForm} onFieldDataChanged={onMovementFieldChanged}>
          <Item
            dataField="type"
            editorType="dxSelectBox"
            editorOptions={{
              dataSource: [...MOVEMENT_TYPE_OPTIONS],
              displayExpr: "text",
              valueExpr: "value",
            }}
          >
            <Label text="Type" />
            <RequiredRule />
          </Item>
          <Item
            dataField="quantity"
            editorType="dxNumberBox"
            editorOptions={{ min: 0.0001, format: "#,##0.####" }}
          >
            <Label text="Quantity" />
            <RequiredRule />
          </Item>
          <Item
            dataField="note"
            editorType="dxTextArea"
            editorOptions={{ height: 72 }}
          >
            <Label text="Note" />
          </Item>
        </Form>
        <div style={{ padding: "8px 0 0", textAlign: "right" }}>
          <Button text="Save" type="default" onClick={submitMovement} />
        </div>
      </Popup>
    </div>
  );
}
