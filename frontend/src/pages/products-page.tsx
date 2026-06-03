import { useCallback, useEffect, useMemo, useRef, useState, Fragment } from "react";
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
import TabPanel, { Item as TabPanelItem } from "devextreme-react/tab-panel";
import Form, {
  Item,
  Label,
  RequiredRule as FormRequiredRule,
  type FormTypes,
} from "devextreme-react/form";
import notify from "devextreme/ui/notify";
import { AppDataGrid } from "../components/app-data-grid";
import { PageReadGuard } from "../components/require-page-access";
import { usePagePermissions } from "../hooks/use-permissions";
import { StockMovementProductSummary } from "../components/stock-movement-product-summary";
import { apiFetch, apiFetchBlob } from "../api/client";
import { getDataGridErrorMessage, getErrorMessage } from "../utils/error-message";
import type { ProductOption } from "../components/personnel-bin-popup";
import {
  MOVEMENT_TYPE_OPTIONS,
  type MovementTypeValue,
  movementTypeLabel,
} from "../constants/movement-types";
import { productCategoryFilterLookup, productCategorySelectItems } from "../constants/it-product-categories";
import type { EditorPreparingEvent } from "devextreme/ui/data_grid";

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

type AddCategoryForm = {
  label: string;
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

type PurchaseHistoryRow = {
  purchaseId: string;
  createdAt: string;
  destination: string;
  lineDestination?: string;
  receivedWhere?: string;
  status: string;
  supplierId: string;
  supplierName: string;
  bonOriginalName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

/** Grid row: synthetic id for DataGrid keyExpr */
type PurchaseHistoryGridRow = PurchaseHistoryRow & { id: string };

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
  const { canAdd, canEdit, canDelete, canRead } = usePagePermissions("products");
  const gridRef = useRef<DataGridRef>(null);
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
  const [statementMovements, setStatementMovements] = useState<MovementRow[] | null>(null);
  const [statementPurchases, setStatementPurchases] = useState<PurchaseHistoryGridRow[] | null>(
    null,
  );
  const [statementLoading, setStatementLoading] = useState(false);
  const [statementError, setStatementError] = useState<string | null>(null);

  const [savedCategoryLabels, setSavedCategoryLabels] = useState<string[]>([]);
  const [addCategoryOpen, setAddCategoryOpen] = useState(false);
  const [addCategoryForm, setAddCategoryForm] = useState<AddCategoryForm>({ label: "" });

  const loadSavedCategories = useCallback(async () => {
    try {
      const res = (await apiFetch("/api/product-categories")) as { labels?: string[] };
      setSavedCategoryLabels(Array.isArray(res.labels) ? res.labels : []);
    } catch (e: unknown) {
      notify(getErrorMessage(e, "Failed to load product categories"), "error", 5000);
    }
  }, []);

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
    void loadSavedCategories();
  }, [loadAssignMeta, loadSavedCategories]);

  const categoryLookupDataSource = useMemo(
    () => productCategoryFilterLookup(savedCategoryLabels),
    [savedCategoryLabels],
  );

  const categoryFormSelectItems = useMemo(
    () => productCategorySelectItems(savedCategoryLabels, null),
    [savedCategoryLabels],
  );

  const dataSource = useMemo(
    () =>
      new CustomStore({
        key: "id",
        load: () => apiFetch("/api/products") as Promise<Record<string, unknown>[]>,
        insert: async (values) => {
          const created = (await apiFetch("/api/products", {
            method: "POST",
            body: JSON.stringify(values),
          })) as Record<string, unknown>;
          await loadSavedCategories();
          return created;
        },
        update: async (key, values) => {
          const payload = { ...(values as Record<string, unknown>) };
          delete payload.id;
          delete payload.quantityOnHand;
          delete payload.lastPurchaseUnitPrice;
          delete payload.averagePurchaseUnitPrice;
          const updated = (await apiFetch(`/api/products/${key}`, {
            method: "PATCH",
            body: JSON.stringify(payload),
          })) as Record<string, unknown>;
          await loadSavedCategories();
          return updated;
        },
        remove: (key) =>
          apiFetch(`/api/products/${key}`, { method: "DELETE" }) as Promise<void>,
      }),
    [loadSavedCategories],
  );

  const onCategoryEditorPreparing = useCallback(
    (e: EditorPreparingEvent) => {
      if (e.dataField !== "category") {
        return;
      }
      if (e.editorName && e.editorName !== "dxSelectBox") {
        return;
      }
      const row = e.row?.data as { category?: string } | undefined;
      const cur = typeof row?.category === "string" ? row.category.trim() : "";
      const items = productCategorySelectItems(savedCategoryLabels, cur);
      e.editorOptions = {
        ...e.editorOptions,
        items,
        searchEnabled: true,
        searchMode: "contains",
        showClearButton: true,
        placeholder: "Choose a category or type a new one…",
        acceptCustomValue: true,
      };
    },
    [savedCategoryLabels],
  );

  const loadStatementData = useCallback(async (productId: string) => {
    setStatementLoading(true);
    setStatementError(null);
    setStatementMovements(null);
    setStatementPurchases(null);
    try {
      const [movRes, purRes] = await Promise.all([
        apiFetch(`/api/products/${productId}/movements?skip=0&take=5000`) as Promise<{
          items?: MovementRow[];
        }>,
        apiFetch(`/api/products/${productId}/purchase-history`) as Promise<{
          items?: PurchaseHistoryRow[];
        }>,
      ]);
      const movItems = Array.isArray(movRes?.items) ? movRes.items : [];
      const purRaw = Array.isArray(purRes?.items) ? purRes.items : [];
      setStatementMovements(movItems);
      setStatementPurchases(
        purRaw.map((it, idx) => ({
          ...it,
          id: `${it.purchaseId}-${idx}`,
        })),
      );
    } catch (e: unknown) {
      setStatementError(getErrorMessage(e, "Failed to load product statement"));
      setStatementMovements([]);
      setStatementPurchases([]);
    } finally {
      setStatementLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!statementOpen || !statementProduct?.id) {
      return;
    }
    void loadStatementData(statementProduct.id);
  }, [statementOpen, statementProduct?.id, loadStatementData]);

  const onAssignFieldChanged = useCallback((e: FormTypes.FieldDataChangedEvent) => {
    const { dataField, value } = e;
    if (!dataField) return;
    setAssignForm((prev) => ({ ...prev, [dataField]: value }));
  }, []);

  const onAddCategoryFieldChanged = useCallback((e: FormTypes.FieldDataChangedEvent) => {
    const { dataField, value } = e;
    if (!dataField) return;
    setAddCategoryForm((prev) => ({ ...prev, [dataField]: value }));
  }, []);

  const openAddCategoryPopup = useCallback(() => {
    setAddCategoryForm({ label: "" });
    setAddCategoryOpen(true);
  }, []);

  const submitAddCategory = useCallback(async () => {
    const label = addCategoryForm.label.trim();
    if (!label) {
      notify("Enter a category name", "warning", 3000);
      return;
    }
    try {
      const res = (await apiFetch("/api/product-categories", {
        method: "POST",
        body: JSON.stringify({ label }),
      })) as { labels?: string[] };
      setSavedCategoryLabels(Array.isArray(res.labels) ? res.labels : []);
      setAddCategoryOpen(false);
      setAddCategoryForm({ label: "" });
      notify("Category saved. It is available when editing products.", "success", 3500);
    } catch (e: unknown) {
      notify(getErrorMessage(e, "Failed to save category"), "error", 5000);
    }
  }, [addCategoryForm]);

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
    setStatementMovements(null);
    setStatementPurchases(null);
    setStatementError(null);
    setStatementLoading(true);
    setStatementOpen(true);
  }, []);

  const downloadStatementBon = useCallback(async (row: PurchaseHistoryGridRow) => {
    if (!row.purchaseId || !row.bonOriginalName) {
      return;
    }
    try {
      const blob = await apiFetchBlob(`/api/purchases/${row.purchaseId}/bon`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = row.bonOriginalName || "bon";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      notify(getErrorMessage(e, "Download failed"), "error", 5000);
    }
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
      const productId = movementProduct.id;
      const reloadStatementForProduct =
        statementOpen && statementProduct?.id === productId ? productId : null;
      await apiFetch("/api/stock/movements", {
        method: "POST",
        body: JSON.stringify({
          productId,
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
      if (reloadStatementForProduct) {
        void loadStatementData(reloadStatementForProduct);
      }
    } catch (e: unknown) {
      notify(getErrorMessage(e, "Failed to save movement"), "error", 5000);
    }
  }, [movementProduct, movementForm, statementOpen, statementProduct?.id, loadStatementData]);

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

  const renderStatementPopupContent = useCallback(() => {
    if (!statementProduct) {
      return <div style={{ minHeight: 80 }} />;
    }

    const movements = statementMovements ?? [];
    const purchases = statementPurchases ?? [];
    const productId = statementProduct.id;
    const tabHeight = "100%";

    return (
      <div className="product-statement-popup">
        <StockMovementProductSummary
          sku={statementProduct.sku}
          name={statementProduct.name}
          quantityOnHand={statementProduct.quantityOnHand}
          description={statementProduct.description}
        />
        <p className="product-statement-popup__hint">
          Warehouse movements and completed purchase lines for this product. Use the tabs
          below; filter and export apply to the active table.
        </p>
        {statementError ? (
          <div className="product-statement-popup__error">{statementError}</div>
        ) : null}
        {statementLoading ? (
          <div className="product-statement-popup__loading">Loading statement…</div>
        ) : (
          <TabPanel
            className="product-statement-popup__tabs"
            height="100%"
            deferRendering={false}
            animationEnabled={false}
          >
            <TabPanelItem title={`Stock movements (${movements.length})`}>
              <div className="product-statement-popup__grid-pane">
                <AppDataGrid
                  key={`m-${productId}`}
                  keyExpr="id"
                  className="stock-movements-grid"
                  persistenceKey={`itm-product-statement-m-${productId}`}
                  exportFileName={`${statementProduct.sku}-movements`}
                  dataSource={movements}
                  remoteOperations={false}
                  height={tabHeight}
                  showAddRowButton={false}
                  onDataErrorOccurred={(e) => {
                    notify(getDataGridErrorMessage(e), "error", 5000);
                  }}
                >
                  <FilterRow visible />
                  <Column dataField="createdAt" dataType="datetime" caption="When" width={150} />
                  <Column
                    dataField="type"
                    caption="Type"
                    width={200}
                    calculateCellValue={(row: MovementRow) => movementTypeLabel(row.type)}
                  />
                  <Column dataField="quantity" dataType="number" width={100} />
                  <Column
                    dataField="balanceAfter"
                    caption="Balance after"
                    dataType="number"
                    width={120}
                  />
                  <Column dataField="note" />
                  <Column
                    caption="User"
                    width={140}
                    calculateCellValue={(row: MovementRow) =>
                      row.user?.displayName || row.user?.email || ""
                    }
                  />
                  <Paging defaultPageSize={25} />
                  <Pager showPageSizeSelector showInfo />
                </AppDataGrid>
              </div>
            </TabPanelItem>
            <TabPanelItem title={`Purchases (${purchases.length})`}>
              <div className="product-statement-popup__grid-pane">
                <AppDataGrid
                  key={`p-${productId}`}
                  keyExpr="id"
                  persistenceKey={`itm-product-statement-p-${productId}`}
                  exportFileName={`${statementProduct.sku}-purchases`}
                  dataSource={purchases}
                  remoteOperations={false}
                  height={tabHeight}
                  showAddRowButton={false}
                  onDataErrorOccurred={(e) => {
                    notify(getDataGridErrorMessage(e), "error", 5000);
                  }}
                >
                  <FilterRow visible />
                  <Column dataField="createdAt" dataType="datetime" caption="When" width={150} />
                  <Column dataField="supplierName" caption="Supplier" width={180} />
                  <Column dataField="quantity" dataType="number" width={90} />
                  <Column
                    dataField="unitPrice"
                    caption="Unit price"
                    dataType="number"
                    format="#,##0.00"
                    width={110}
                  />
                  <Column
                    dataField="lineTotal"
                    caption="Line total"
                    dataType="number"
                    format="#,##0.00"
                    width={110}
                  />
                  <Column
                    dataField="receivedWhere"
                    caption="Received at"
                    width={240}
                    calculateCellValue={(row: PurchaseHistoryGridRow) =>
                      row.receivedWhere ||
                      row.lineDestination ||
                      row.destination ||
                      "—"
                    }
                  />
                  <Column
                    dataField="bonOriginalName"
                    caption="Bon (click to download)"
                    width={220}
                    cellRender={(cell) => {
                      const row = cell.data as PurchaseHistoryGridRow | undefined;
                      const name = row?.bonOriginalName?.trim();
                      if (!name || !row?.purchaseId) {
                        return <span style={{ opacity: 0.55 }}>—</span>;
                      }
                      return (
                        <button
                          type="button"
                          className="dx-link"
                          style={{
                            background: "none",
                            border: "none",
                            padding: 0,
                            cursor: "pointer",
                            textAlign: "left",
                            font: "inherit",
                            color: "var(--dx-color-link, #0f548c)",
                            textDecoration: "underline",
                          }}
                          onClick={(ev) => {
                            ev.preventDefault();
                            ev.stopPropagation();
                            void downloadStatementBon(row);
                          }}
                        >
                          {name}
                        </button>
                      );
                    }}
                  />
                  <Paging defaultPageSize={25} />
                  <Pager showPageSizeSelector showInfo />
                </AppDataGrid>
              </div>
            </TabPanelItem>
          </TabPanel>
        )}
      </div>
    );
  }, [
    statementProduct,
    statementMovements,
    statementPurchases,
    statementLoading,
    statementError,
    downloadStatementBon,
  ]);

  return (
    <PageReadGuard resource="products">
    <div className="content-block content-block--fill">
      <div className="page-toolbar">
        <h2>Products</h2>
      </div>

      <div className="page-grid-body">
        <AppDataGrid
          permissionResource="products"
          ref={gridRef}
          keyExpr="id"
          persistenceKey="itm-grid-products-v3"
          dataSource={dataSource}
          repaintChangesOnly
          focusedRowEnabled
          height="100%"
          toolbarItems={
            <Fragment>
              <GridToolbarItem
                location="before"
                widget="dxButton"
                options={{
                  text: "Assign to personnel bin",
                  type: "default",
                  stylingMode: "contained",
                  icon: "user",
                  disabled:
                    !canAdd ||
                    personnelOptions.length === 0 ||
                    productOptions.length === 0,
                  onClick: () => {
                    void openAssignPopup();
                  },
                }}
              />
              <GridToolbarItem
                location="before"
                widget="dxButton"
                options={{
                  text: "Add category",
                  stylingMode: "outlined",
                  icon: "plus",
                  disabled: !canAdd,
                  onClick: () => openAddCategoryPopup(),
                }}
              />
            </Fragment>
          }
          onInitNewRow={(e) => {
            const d = e.data as { quantityOnHand?: number; category?: string };
            d.quantityOnHand = 0;
            d.category = "";
          }}
          onDataErrorOccurred={(e) => {
            notify(getDataGridErrorMessage(e), "error", 5000);
          }}
          onEditorPreparing={onCategoryEditorPreparing}
        >
        <Editing
          allowAdding={canAdd}
          allowUpdating={canEdit}
          allowDeleting={canDelete}
          mode="popup"
          useIcons
        >
          <Popup title="Product" showTitle width={480} height="auto" />
        </Editing>
        <FilterRow visible />
        <Column dataField="sku" width={140}>
          <RequiredRule />
        </Column>
        <Column
          dataField="category"
          caption="Category"
          width={220}
          lookup={{ dataSource: categoryLookupDataSource }}
          formItem={{
            editorType: "dxSelectBox",
            editorOptions: {
              items: categoryFormSelectItems,
              searchEnabled: true,
              searchMode: "contains",
              showClearButton: true,
              placeholder: "Choose a category or type a new one…",
              acceptCustomValue: true,
            },
          }}
        />
        <Column dataField="name" width={220}>
          <RequiredRule />
        </Column>
        <Column dataField="description" formItem={{ colSpan: 2 }} />
        <Column
          dataField="quantityOnHand"
          caption="Qty on hand"
          dataType="number"
          allowEditing={false}
          formItem={{
            editorOptions: { readOnly: true },
            helpText: "Updated from stock movements and completed purchases.",
          }}
        />
        <Column
          dataField="lastPurchaseUnitPrice"
          caption="Last purchase price"
          dataType="number"
          format="#,##0.00"
          allowEditing={false}
          allowSorting
          formItem={{ visible: false }}
        />
        <Column
          dataField="averagePurchaseUnitPrice"
          caption="Avg purchase price"
          dataType="number"
          format="#,##0.00"
          allowEditing={false}
          allowSorting
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
          <ColumnButton name="edit" disabled={!canEdit} />
          <ColumnButton
            hint="New stock movement"
            icon="import"
            disabled={!canAdd}
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
            hint="Product statement (movements & purchases)"
            icon="orderedlist"
            disabled={!canRead}
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
          <ColumnButton name="delete" disabled={!canDelete} />
        </Column>
        <Paging defaultPageSize={20} />
        <Pager showPageSizeSelector showInfo />
      </AppDataGrid>
      </div>

      <PopupDx
        visible={addCategoryOpen}
        onHiding={() => setAddCategoryOpen(false)}
        showTitle
        title="Add product category"
        width={440}
        height="auto"
        showCloseButton
      >
        <Form formData={addCategoryForm} onFieldDataChanged={onAddCategoryFieldChanged}>
          <Item
            dataField="label"
            editorType="dxTextBox"
            editorOptions={{ maxLength: 128, placeholder: "e.g. Lab instruments" }}
          >
            <Label text="Category name" />
            <FormRequiredRule />
          </Item>
        </Form>
        <div style={{ padding: "8px 0 0", textAlign: "right" }}>
          <Button text="Cancel" stylingMode="outlined" onClick={() => setAddCategoryOpen(false)} />
          <Button
            text="Save category"
            type="default"
            stylingMode="contained"
            onClick={() => void submitAddCategory()}
          />
        </div>
      </PopupDx>

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
          setStatementMovements(null);
          setStatementPurchases(null);
          setStatementError(null);
          setStatementLoading(false);
        }}
        showTitle
        title={
          statementProduct
            ? `Product statement — ${statementProduct.sku}`
            : "Product statement"
        }
        width="96vw"
        height="90vh"
        wrapperAttr={{ class: "product-statement-popup-shell" }}
        showCloseButton
        contentRender={renderStatementPopupContent}
      />
    </div>
    </PageReadGuard>
  );
}
