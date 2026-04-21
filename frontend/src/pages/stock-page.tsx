import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CustomStore from "devextreme/data/custom_store";
import {
  Column,
  Paging,
  Pager,
  FilterRow,
  Item as GridToolbarItem,
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
  const [movementForm, setMovementForm] = useState<{
    type: MovementTypeValue | null;
    quantity: number;
    note: string;
  }>({
    type: null,
    quantity: 1,
    note: "",
  });

  const loadProducts = useCallback(async () => {
    const list = (await apiFetch("/api/products")) as Product[];
    setProducts(list);
    setProductId((prev) => {
      if (prev && list.some((p) => p.id === prev)) {
        return prev;
      }
      return null;
    });
  }, []);

  useEffect(() => {
    loadProducts().catch((e: unknown) => {
      notify(e instanceof Error ? e.message : "Failed to load products", "error", 4000);
    });
  }, [loadProducts]);

  /** One batch (up to API cap) so toolbar search / filter row apply to the full loaded slice, not a single server page. */
  const movementsStore = useMemo(() => {
    if (!productId) {
      return new CustomStore({
        key: "id",
        load: () => Promise.resolve({ data: [], totalCount: 0 }),
      });
    }
    return new CustomStore({
      key: "id",
      load: async () => {
        const res = (await apiFetch(
          `/api/products/${productId}/movements?skip=0&take=5000`,
        )) as {
          items: MovementRow[];
          total: number;
        };
        return { data: res.items, totalCount: res.items.length };
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
    if (!movementForm.type) {
      notify("Select a movement type", "warning", 2000);
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
      setMovementForm({ type: null, quantity: 1, note: "" });
      await loadProducts();
      gridRef.current?.instance().refresh();
    } catch (e: unknown) {
      notify(e instanceof Error ? e.message : "Failed to save", "error", 4000);
    }
  }, [productId, movementForm, loadProducts]);

  const selectedProduct = products.find((p) => p.id === productId);

  const stockToolbarItems = (
    <GridToolbarItem
      location="before"
      cssClass="stock-grid-toolbar-item"
      render={() => (
        <div className="stock-grid-toolbar">
          <div className="stock-grid-toolbar__product">
            <SelectBox
              dataSource={products}
              displayExpr={(p: Product | null | undefined) =>
                p ? `${p.sku} — ${p.name}` : ""
              }
              valueExpr="id"
              value={productId}
              onValueChanged={onProductChange}
              searchEnabled
              showDropDownButton
              showClearButton
              placeholder="Search product…"
              width="100%"
            />
          </div>
          {selectedProduct ? (
            <span className="stock-grid-toolbar__meta">
              {selectedProduct.sku} · on hand {selectedProduct.quantityOnHand}
            </span>
          ) : null}
          <Button
            text="New movement"
            type="default"
            stylingMode="contained"
            icon="add"
            onClick={() => {
              setMovementForm({ type: null, quantity: 1, note: "" });
              setPopupOpen(true);
            }}
            disabled={!productId}
          />
        </div>
      )}
    />
  );

  return (
    <div className="content-block content-block--fill">
      <div className="page-toolbar">
        <h2>Stock</h2>
      </div>

      <div className="page-grid-body">
        <AppDataGrid
          ref={gridRef}
          className="stock-movements-grid"
          persistenceKey="itm-grid-stock-movements"
          dataSource={movementsStore}
          height="100%"
          showAddRowButton={false}
          toolbarItems={stockToolbarItems}
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
              searchEnabled: true,
              showClearButton: true,
              placeholder: "Select type…",
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
