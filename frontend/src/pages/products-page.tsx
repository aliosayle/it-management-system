import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CustomStore from "devextreme/data/custom_store";
import {
  Column,
  ColumnButton,
  Paging,
  Pager,
  FilterRow,
  Editing,
  Popup,
  RequiredRule,
  Item as GridToolbarItem,
  type DataGridRef,
} from "devextreme-react/data-grid";
import Button from "devextreme-react/button";
import PopupDx from "devextreme-react/popup";
import Form, {
  Item,
  Label,
  RequiredRule as FormRequiredRule,
  type FormTypes,
} from "devextreme-react/form";
import notify from "devextreme/ui/notify";
import { AppDataGrid } from "../components/app-data-grid";
import { StockMovementProductSummary } from "../components/stock-movement-product-summary";
import { apiFetch } from "../api/client";
import { getDataGridErrorMessage, getErrorMessage } from "../utils/error-message";
import type { ProductOption } from "../components/personnel-bin-popup";
import {
  MOVEMENT_TYPE_OPTIONS,
  type MovementTypeValue,
  movementTypeLabel,
} from "../constants/movement-types";

type PersonnelApi = {
  id: string;
  fullName: string;
  siteLabel: string;
};

type AssignForm = {
  personnelId: string | null;
  productId: string | null;
  quantity: number;
  note: string;
};

type MovementRow = {
  id: string;
  type: string;
  quantity: number;
  balanceAfter: number;
  note: string | null;
  createdAt: string;
  user?: { displayName: string; email: string };
};

type ProductPick = {
  id: string;
  sku: string;
  name: string;
  quantityOnHand: number;
  description: string | null;
};

function productPickFromRow(row: Record<string, unknown>): ProductPick {
  const qoh = row.quantityOnHand;
  const qohNum =
    typeof qoh === "number" && Number.isFinite(qoh) ? qoh : Number(qoh);
  const desc = row.description;
  return {
    id: String(row.id),
    sku: String(row.sku ?? ""),
    name: String(row.name ?? ""),
    quantityOnHand: Number.isFinite(qohNum) ? qohNum : 0,
    description:
      desc === null || desc === undefined
        ? null
        : String(desc).trim() === ""
          ? null
          : String(desc),
  };
}

export default function ProductsPage() {
  const gridRef = useRef<DataGridRef>(null);
  const statementGridRef = useRef<DataGridRef>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [personnelOptions, setPersonnelOptions] = useState<
    { id: string; label: string }[]
  >([]);
  const [productOptions, setProductOptions] = useState<ProductOption[]>([]);
  const [assignForm, setAssignForm] = useState<AssignForm>({
    personnelId: null,
    productId: null,
    quantity: 1,
    note: "",
  });

  const [movementOpen, setMovementOpen] = useState(false);
  const [movementProduct, setMovementProduct] = useState<ProductPick | null>(null);
  const [movementForm, setMovementForm] = useState<{
    type: MovementTypeValue | null;
    quantity: number;
    note: string;
  }>({ type: null, quantity: 1, note: "" });

  const [statementOpen, setStatementOpen] = useState(false);
  const [statementProduct, setStatementProduct] = useState<ProductPick | null>(null);

  const loadAssignMeta = useCallback(async () => {
    const [pl, pr] = await Promise.all([
      apiFetch("/api/personnel") as Promise<PersonnelApi[]>,
      apiFetch("/api/products") as Promise<{ id: string; sku: string; name: string }[]>,
    ]);
    setPersonnelOptions(
      pl.map((p) => ({
        id: p.id,
        label: `${p.fullName} — ${p.siteLabel}`,
      })),
    );
    setProductOptions(
      pr.map((p) => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        label: `${p.sku} — ${p.name}`,
      })),
    );
    return { personnel: pl, products: pr };
  }, []);

  useEffect(() => {
    loadAssignMeta().catch((e: unknown) => {
      notify(getErrorMessage(e, "Failed to load assign options"), "error", 5000);
    });
  }, [loadAssignMeta]);

  const dataSource = useMemo(
    () =>
      new CustomStore({
        key: "id",
        load: () => apiFetch("/api/products") as Promise<Record<string, unknown>[]>,
        insert: (values) =>
          apiFetch("/api/products", {
            method: "POST",
            body: JSON.stringify(values),
          }) as Promise<Record<string, unknown>>,
        update: (key, values) => {
          const payload = { ...(values as Record<string, unknown>) };
          delete payload.id;
          return apiFetch(`/api/products/${key}`, {
            method: "PATCH",
            body: JSON.stringify(payload),
          }) as Promise<Record<string, unknown>>;
        },
        remove: (key) =>
          apiFetch(`/api/products/${key}`, { method: "DELETE" }) as Promise<void>,
      }),
    [],
  );

  const movementsStatementStore = useMemo(() => {
    const pid = statementProduct?.id;
    if (!pid) {
      return new CustomStore({
        key: "id",
        load: () => Promise.resolve({ data: [], totalCount: 0 }),
      });
    }
    return new CustomStore({
      key: "id",
      load: async () => {
        const res = (await apiFetch(
          `/api/products/${pid}/movements?skip=0&take=5000`,
        )) as { items: MovementRow[] };
        return { data: res.items, totalCount: res.items.length };
      },
    });
  }, [statementProduct?.id]);

  const onAssignFieldChanged = useCallback((e: FormTypes.FieldDataChangedEvent) => {
    const { dataField, value } = e;
    if (!dataField) return;
    setAssignForm((prev) => ({ ...prev, [dataField]: value }));
  }, []);

  const openAssignPopup = useCallback(async () => {
    try {
      await loadAssignMeta();
      const inst = gridRef.current?.instance();
      const key = inst?.option("focusedRowKey") as string | undefined;
      const row =
        key != null
          ? inst?.getVisibleRows().find((r) => r.key === key)?.data
          : undefined;
      const productFromRow = row && typeof row === "object" && "id" in row
        ? (row as { id: string }).id
        : undefined;

      setAssignForm({
        personnelId: null,
        productId: productFromRow ?? null,
        quantity: 1,
        note: "",
      });
      setAssignOpen(true);
    } catch (e: unknown) {
      notify(getErrorMessage(e, "Failed to open"), "error", 5000);
    }
  }, [loadAssignMeta]);

  const onMovementFieldChanged = useCallback((e: FormTypes.FieldDataChangedEvent) => {
    const { dataField, value } = e;
    if (!dataField) return;
    setMovementForm((prev) => ({ ...prev, [dataField]: value }));
  }, []);

  const openMovementForRow = useCallback((row: Record<string, unknown>) => {
    setMovementProduct(productPickFromRow(row));
    setMovementForm({ type: null, quantity: 1, note: "" });
    setMovementOpen(true);
  }, []);

  const openStatementForRow = useCallback((row: Record<string, unknown>) => {
    setStatementProduct(productPickFromRow(row));
    setStatementOpen(true);
  }, []);

  const submitMovementForProduct = useCallback(async () => {
    if (!movementProduct?.id) {
      return;
    }
    if (!movementForm.type) {
      notify("Select a movement type", "warning", 2000);
      return;
    }
    if (!Number.isFinite(movementForm.quantity) || movementForm.quantity <= 0) {
      notify("Enter a positive quantity", "warning", 2000);
      return;
    }
    try {
      await apiFetch("/api/stock/movements", {
        method: "POST",
        body: JSON.stringify({
          productId: movementProduct.id,
          type: movementForm.type,
          quantity: movementForm.quantity,
          note: movementForm.note.trim() || null,
        }),
      });
      notify("Movement saved", "success", 2000);
      setMovementOpen(false);
      setMovementProduct(null);
      setMovementForm({ type: null, quantity: 1, note: "" });
      gridRef.current?.instance().refresh();
      statementGridRef.current?.instance().refresh();
    } catch (e: unknown) {
      notify(getErrorMessage(e, "Failed to save movement"), "error", 5000);
    }
  }, [movementProduct, movementForm]);

  const submitAssign = useCallback(async () => {
    const { personnelId, productId, quantity, note } = assignForm;
    if (!personnelId || !productId) {
      notify("Select personnel and product", "warning", 2500);
      return;
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      notify("Enter a positive quantity", "warning", 2500);
      return;
    }
    try {
      await apiFetch(`/api/personnel/${personnelId}/bin/items`, {
        method: "POST",
        body: JSON.stringify({
          productId,
          quantity,
          note: note.trim() || null,
        }),
      });
      notify("Added to personal bin", "success", 2000);
      setAssignOpen(false);
    } catch (e: unknown) {
      notify(getErrorMessage(e, "Failed to assign"), "error", 5000);
    }
  }, [assignForm]);

  const renderMovementPopupContent = useCallback(
    () => (
      <>
        {movementProduct ? (
          <StockMovementProductSummary
            sku={movementProduct.sku}
            name={movementProduct.name}
            quantityOnHand={movementProduct.quantityOnHand}
            description={movementProduct.description}
          />
        ) : null}
        <Form
          key={movementProduct?.id ?? "movement"}
          colCount={2}
          formData={movementForm}
          onFieldDataChanged={onMovementFieldChanged}
        >
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
            <FormRequiredRule />
          </Item>
          <Item
            dataField="quantity"
            editorType="dxNumberBox"
            editorOptions={{ min: 0.0001, format: "#,##0.####" }}
          >
            <Label text="Quantity" />
            <FormRequiredRule />
          </Item>
          <Item
            dataField="note"
            colSpan={2}
            editorType="dxTextArea"
            editorOptions={{ height: 100 }}
          >
            <Label text="Note" />
          </Item>
        </Form>
        <div style={{ padding: "12px 0 0", textAlign: "right" }}>
          <Button
            text="Cancel"
            stylingMode="outlined"
            onClick={() => {
              setMovementOpen(false);
              setMovementProduct(null);
            }}
          />
          <Button
            text="Save"
            type="default"
            stylingMode="contained"
            onClick={() => {
              void submitMovementForProduct();
            }}
          />
        </div>
      </>
    ),
    [
      movementProduct,
      movementForm,
      onMovementFieldChanged,
      submitMovementForProduct,
    ],
  );

  const renderStatementPopupContent = useCallback(
    () =>
      statementProduct ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            height: 520,
            minHeight: 0,
          }}
        >
          <div style={{ flexShrink: 0 }}>
            <StockMovementProductSummary
              sku={statementProduct.sku}
              name={statementProduct.name}
              quantityOnHand={statementProduct.quantityOnHand}
              description={statementProduct.description}
            />
          </div>
          <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
            <AppDataGrid
              ref={statementGridRef}
              key={statementProduct.id}
              keyExpr="id"
              className="stock-movements-grid"
              persistenceKey={`itm-product-statement-${statementProduct.id}`}
              dataSource={movementsStatementStore}
              height="100%"
              showAddRowButton={false}
              onDataErrorOccurred={(e) => {
                notify(getDataGridErrorMessage(e), "error", 5000);
              }}
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
        </div>
      ) : null,
    [statementProduct, movementsStatementStore],
  );

  return (
    <div className="content-block content-block--fill">
      <div className="page-toolbar">
        <h2>Products</h2>
      </div>

      <div className="page-grid-body">
        <AppDataGrid
          ref={gridRef}
          keyExpr="id"
          persistenceKey="itm-grid-products"
          dataSource={dataSource}
          repaintChangesOnly
          focusedRowEnabled
          height="100%"
          toolbarItems={
            <GridToolbarItem
              location="before"
              widget="dxButton"
              options={{
                text: "Assign to personnel bin",
                type: "default",
                stylingMode: "contained",
                icon: "user",
                disabled: personnelOptions.length === 0 || productOptions.length === 0,
                onClick: () => {
                  void openAssignPopup();
                },
              }}
            />
          }
          onInitNewRow={(e) => {
            (e.data as { quantityOnHand?: number }).quantityOnHand = 0;
          }}
          onDataErrorOccurred={(e) => {
            notify(getDataGridErrorMessage(e), "error", 5000);
          }}
        >
        <Editing allowAdding allowUpdating allowDeleting mode="popup" useIcons>
          <Popup title="Product" showTitle width={480} height="auto" />
        </Editing>
        <FilterRow visible />
        <Column dataField="sku" width={140}>
          <RequiredRule />
        </Column>
        <Column dataField="name" width={220}>
          <RequiredRule />
        </Column>
        <Column dataField="description" formItem={{ colSpan: 2 }} />
        <Column dataField="quantityOnHand" caption="Qty on hand" dataType="number">
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
        <Column type="buttons" width={132}>
          <ColumnButton name="edit" />
          <ColumnButton
            hint="New stock movement"
            icon="import"
            onClick={(e) => {
              if (e.row?.isNewRow) {
                return;
              }
              const row = e.row?.data as Record<string, unknown> | undefined;
              if (row?.id) {
                openMovementForRow(row);
              }
            }}
          />
          <ColumnButton
            hint="Stock statement (movements)"
            icon="orderedlist"
            onClick={(e) => {
              if (e.row?.isNewRow) {
                return;
              }
              const row = e.row?.data as Record<string, unknown> | undefined;
              if (row?.id) {
                openStatementForRow(row);
              }
            }}
          />
          <ColumnButton name="delete" />
        </Column>
        <Paging defaultPageSize={20} />
        <Pager showPageSizeSelector showInfo />
      </AppDataGrid>
      </div>

      <PopupDx
        visible={assignOpen}
        onHiding={() => setAssignOpen(false)}
        showTitle
        title="Assign product to personnel bin"
        width={460}
        height="auto"
        showCloseButton
      >
        <Form formData={assignForm} onFieldDataChanged={onAssignFieldChanged}>
          <Item
            dataField="personnelId"
            editorType="dxSelectBox"
            editorOptions={{
              dataSource: personnelOptions,
              displayExpr: "label",
              valueExpr: "id",
              searchEnabled: true,
              showDropDownButton: true,
              showClearButton: true,
              placeholder: "Search personnel…",
            }}
          >
            <Label text="Personnel" />
            <FormRequiredRule />
          </Item>
          <Item
            dataField="productId"
            editorType="dxSelectBox"
            editorOptions={{
              dataSource: productOptions,
              displayExpr: "label",
              valueExpr: "id",
              searchEnabled: true,
              showDropDownButton: true,
              showClearButton: true,
              placeholder: "Search product…",
            }}
          >
            <Label text="Product" />
            <FormRequiredRule />
          </Item>
          <Item
            dataField="quantity"
            editorType="dxNumberBox"
            editorOptions={{ min: 0.0001, format: "#,##0.####" }}
          >
            <Label text="Quantity" />
            <FormRequiredRule />
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
          <Button text="Cancel" stylingMode="outlined" onClick={() => setAssignOpen(false)} />
          <Button text="Add to bin" type="default" stylingMode="contained" onClick={submitAssign} />
        </div>
      </PopupDx>

      <PopupDx
        visible={movementOpen}
        onHiding={() => {
          setMovementOpen(false);
          setMovementProduct(null);
        }}
        showTitle
        title="Stock movement"
        width={720}
        height="auto"
        showCloseButton
        contentRender={renderMovementPopupContent}
      />

      <PopupDx
        visible={statementOpen}
        onHiding={() => {
          setStatementOpen(false);
          setStatementProduct(null);
        }}
        showTitle
        title={
          statementProduct
            ? `Stock statement — ${statementProduct.sku}`
            : "Stock statement"
        }
        width={1080}
        height={620}
        showCloseButton
        contentRender={renderStatementPopupContent}
      />
    </div>
  );
}
