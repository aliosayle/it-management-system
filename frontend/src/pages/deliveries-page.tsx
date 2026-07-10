import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import CustomStore from "devextreme/data/custom_store";
import {
  Column,
  Paging,
  Pager,
  FilterRow,
  ColumnButton,
  Item as GridToolbarItem,
  MasterDetail,
  type DataGridRef,
} from "devextreme-react/data-grid";
import Button from "devextreme-react/button";
import Popup from "devextreme-react/popup";
import SelectBox from "devextreme-react/select-box";
import TextArea from "devextreme-react/text-area";
import NumberBox from "devextreme-react/number-box";
import notify from "devextreme/ui/notify";
import { AppDataGrid } from "../components/app-data-grid";
import { PageReadGuard } from "../components/require-page-access";
import { usePagePermissions } from "../hooks/use-permissions";
import { apiFetch } from "../api/client";
import { getDataGridErrorMessage, getErrorMessage } from "../utils/error-message";
import {
  deliveryNoteFromDetail,
  downloadDeliveryNotePdf,
} from "../utils/delivery-note-pdf";

type PersonnelRow = { id: string; fullName: string; siteLabel: string };
type SiteRow = { id: string; label: string };
type DepartmentRow = { id: string; label: string; siteLabel: string; name: string; siteId: string };

type ProductMeta = {
  id: string;
  sku: string;
  name: string;
  quantityOnHand: number;
  lastPurchaseUnitPrice: number | null;
  averagePurchaseUnitPrice: number | null;
};

type DeliveryLineSummary = {
  sku: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  priceSource: string;
};

type DeliveryListRow = {
  id: string;
  destination: string;
  destinationSummary: string;
  notes: string | null;
  createdAt: string;
  createdByName: string;
  lineCount: number;
  grandTotal: number;
  lineItems?: DeliveryLineSummary[];
};

type DeliveryDetail = {
  id: string;
  destination: string;
  destinationSummary: string;
  notes: string | null;
  createdAt: string;
  grandTotal: number;
  createdBy: { displayName: string; email: string };
  lines: Array<{
    id: string;
    productId: string;
    sku: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    priceSource: string;
    lineIndex: number;
  }>;
};

type PriceSource = "LAST_PURCHASE" | "AVERAGE_PURCHASE" | "MANUAL" | "ZERO";

type FormLine = {
  key: string;
  productId: string | null;
  quantity: number;
  priceSource: PriceSource;
  unitPrice: number;
};

const DEST_OPTIONS = [
  { value: "PERSONNEL_BIN", text: "Personal bin" },
  { value: "SITE_BIN", text: "Site" },
  { value: "DEPARTMENT", text: "Department" },
  { value: "GENERAL", text: "General issue" },
] as const;

const PRICE_SOURCE_OPTIONS = [
  { value: "LAST_PURCHASE", text: "Last price" },
  { value: "AVERAGE_PURCHASE", text: "Avg price" },
  { value: "MANUAL", text: "Manual" },
  { value: "ZERO", text: "$0" },
] as const;

function priceSourceLabel(src: string): string {
  return PRICE_SOURCE_OPTIONS.find((o) => o.value === src)?.text ?? src;
}

function newLineKey(): string {
  return `line-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function emptyLine(): FormLine {
  return {
    key: newLineKey(),
    productId: null,
    quantity: 1,
    priceSource: "LAST_PURCHASE",
    unitPrice: 0,
  };
}

function unitPriceForSource(product: ProductMeta | undefined, source: PriceSource): number {
  if (!product) return 0;
  if (source === "ZERO") return 0;
  if (source === "LAST_PURCHASE") return product.lastPurchaseUnitPrice ?? 0;
  if (source === "AVERAGE_PURCHASE") return product.averagePurchaseUnitPrice ?? 0;
  return 0;
}

function renderDeliveryLinesDetail(detail: { data?: DeliveryListRow } | DeliveryListRow) {
  const row =
    detail && typeof detail === "object" && "data" in detail
      ? (detail as { data?: DeliveryListRow }).data
      : (detail as DeliveryListRow);
  if (!row) return null;

  const items = row.lineItems ?? [];
  const th: CSSProperties = {
    textAlign: "left",
    padding: "6px 8px",
    borderBottom: "1px solid #e0e0e0",
    fontWeight: 600,
  };
  const td: CSSProperties = { padding: "6px 8px", borderBottom: "1px solid #f0f0f0" };

  return (
    <div style={{ padding: "12px 16px 16px" }}>
      <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>Lines on this delivery</div>
      {items.length === 0 ? (
        <span style={{ opacity: 0.7 }}>No line items.</span>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>
              <th style={th}>SKU</th>
              <th style={th}>Product</th>
              <th style={{ ...th, textAlign: "right" }}>Qty</th>
              <th style={{ ...th, textAlign: "right" }}>Unit price</th>
              <th style={{ ...th, textAlign: "right" }}>Line total</th>
              <th style={th}>Price source</th>
            </tr>
          </thead>
          <tbody>
            {items.map((line, i) => (
              <tr key={`${row.id}-line-${i}`}>
                <td style={td}>{line.sku}</td>
                <td style={td}>{line.productName}</td>
                <td style={{ ...td, textAlign: "right" }}>{line.quantity}</td>
                <td style={{ ...td, textAlign: "right" }}>
                  {Number(line.unitPrice).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 4,
                  })}
                </td>
                <td style={{ ...td, textAlign: "right" }}>
                  {Number(line.lineTotal).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </td>
                <td style={td}>{priceSourceLabel(line.priceSource)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function DeliveriesPage() {
  const { canAdd } = usePagePermissions("deliveries");
  const gridRef = useRef<DataGridRef>(null);

  const [popupOpen, setPopupOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [destination, setDestination] = useState<(typeof DEST_OPTIONS)[number]["value"]>("PERSONNEL_BIN");
  const [targetPersonnelId, setTargetPersonnelId] = useState<string | null>(null);
  const [targetSiteId, setTargetSiteId] = useState<string | null>(null);
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<FormLine[]>([emptyLine()]);

  const [personnel, setPersonnel] = useState<PersonnelRow[]>([]);
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [departments, setDepartments] = useState<DepartmentRow[]>([]);
  const [products, setProducts] = useState<ProductMeta[]>([]);

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const dataSource = useMemo(
    () =>
      new CustomStore({
        key: "id",
        load: () => apiFetch("/api/deliveries") as Promise<DeliveryListRow[]>,
      }),
    [],
  );

  const reloadGrid = useCallback(() => {
    gridRef.current?.instance()?.refresh();
  }, []);

  const loadMeta = useCallback(async () => {
    const [p, s, d, prods] = await Promise.all([
      apiFetch("/api/personnel") as Promise<PersonnelRow[]>,
      apiFetch("/api/sites") as Promise<SiteRow[]>,
      apiFetch("/api/departments") as Promise<DepartmentRow[]>,
      apiFetch("/api/deliveries/meta/products") as Promise<ProductMeta[]>,
    ]);
    setPersonnel(p);
    setSites(s);
    setDepartments(d);
    setProducts(prods);
  }, []);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  const resetForm = useCallback(() => {
    setDestination("PERSONNEL_BIN");
    setTargetPersonnelId(null);
    setTargetSiteId(null);
    setDepartmentId(null);
    setNotes("");
    setLines([emptyLine()]);
  }, []);

  const openCreate = useCallback(() => {
    resetForm();
    setPopupOpen(true);
  }, [resetForm]);

  const closePopup = useCallback(() => {
    setPopupOpen(false);
  }, []);

  const updateLine = useCallback((key: string, patch: Partial<FormLine>) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.key !== key) return l;
        const next = { ...l, ...patch };
        if (patch.productId !== undefined || patch.priceSource !== undefined) {
          const product = productById.get(next.productId ?? "");
          if (next.priceSource !== "MANUAL") {
            next.unitPrice = unitPriceForSource(product, next.priceSource);
          } else if (patch.productId !== undefined && product) {
            next.unitPrice = unitPriceForSource(product, "LAST_PURCHASE");
          }
        }
        return next;
      }),
    );
  }, [productById]);

  const addLine = useCallback(() => {
    setLines((prev) => [...prev, emptyLine()]);
  }, []);

  const removeLine = useCallback((key: string) => {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.key !== key)));
  }, []);

  const linesGrandTotal = useMemo(
    () =>
      lines.reduce(
        (sum, l) => sum + l.quantity * (Number.isFinite(l.unitPrice) ? l.unitPrice : 0),
        0,
      ),
    [lines],
  );

  const reprintDelivery = useCallback(async (row: DeliveryListRow) => {
    try {
      const detail = (await apiFetch(`/api/deliveries/${row.id}`)) as DeliveryDetail;
      downloadDeliveryNotePdf(deliveryNoteFromDetail(detail));
      notify("Bon de livraison téléchargé", "success", 2000);
    } catch (e: unknown) {
      notify(getErrorMessage(e, "Failed to reprint delivery note"), "error", 5000);
    }
  }, []);

  const submitDelivery = useCallback(async () => {
    if (destination === "PERSONNEL_BIN" && !targetPersonnelId) {
      notify("Select personnel for the personal bin", "warning", 2500);
      return;
    }
    if (destination === "SITE_BIN" && !targetSiteId) {
      notify("Select a site", "warning", 2500);
      return;
    }
    if (destination === "DEPARTMENT" && !departmentId) {
      notify("Select a department", "warning", 2500);
      return;
    }

    const payloadLines = lines
      .filter((l) => l.productId && l.quantity > 0)
      .map((l) => ({
        productId: l.productId as string,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        priceSource: l.priceSource,
      }));

    if (payloadLines.length === 0) {
      notify("Add at least one product line", "warning", 2500);
      return;
    }

    for (let i = 0; i < payloadLines.length; i++) {
      const pl = payloadLines[i]!;
      const product = productById.get(pl.productId);
      if (product && pl.quantity > product.quantityOnHand) {
        notify(
          `Line ${i + 1}: insufficient warehouse stock (${product.quantityOnHand} on hand).`,
          "warning",
          4000,
        );
        return;
      }
    }

    setSubmitting(true);
    try {
      const detail = (await apiFetch("/api/deliveries", {
        method: "POST",
        body: JSON.stringify({
          destination,
          targetPersonnelId: destination === "PERSONNEL_BIN" ? targetPersonnelId : null,
          targetSiteId: destination === "SITE_BIN" ? targetSiteId : null,
          departmentId: destination === "DEPARTMENT" ? departmentId : null,
          notes: notes.trim() || null,
          lines: payloadLines,
        }),
      })) as DeliveryDetail;

      notify("Delivery recorded", "success", 2000);
      downloadDeliveryNotePdf(deliveryNoteFromDetail(detail));
      closePopup();
      resetForm();
      reloadGrid();
      void loadMeta();
    } catch (e: unknown) {
      notify(getErrorMessage(e, "Failed to save delivery"), "error", 5000);
    } finally {
      setSubmitting(false);
    }
  }, [
    destination,
    targetPersonnelId,
    targetSiteId,
    departmentId,
    notes,
    lines,
    productById,
    closePopup,
    resetForm,
    reloadGrid,
    loadMeta,
  ]);

  const productOptions = useMemo(
    () =>
      products.map((p) => ({
        id: p.id,
        label: `${p.sku} — ${p.name} (${p.quantityOnHand} on hand)`,
      })),
    [products],
  );

  const personnelOptions = useMemo(
    () => personnel.map((p) => ({ id: p.id, label: `${p.fullName} (${p.siteLabel})` })),
    [personnel],
  );

  return (
    <PageReadGuard resource="deliveries">
      <div className="content-block content-block--fill">
        <div className="page-toolbar">
          <h2>Deliveries</h2>
        </div>

        <div className="page-grid-body">
          <AppDataGrid
            ref={gridRef}
            permissionResource="deliveries"
            persistenceKey="itm-grid-deliveries-v1"
            className="deliveries-grid"
            keyExpr="id"
            dataSource={dataSource}
            repaintChangesOnly
            height="100%"
            columnAutoWidth={false}
            showAddRowButton={false}
            toolbarItems={
              <GridToolbarItem
                location="before"
                widget="dxButton"
                options={{
                  text: "New delivery",
                  type: "default",
                  stylingMode: "contained",
                  icon: "add",
                  disabled: !canAdd,
                  onClick: () => openCreate(),
                }}
              />
            }
            onDataErrorOccurred={(e) => {
              notify(getDataGridErrorMessage(e), "error", 5000);
            }}
          >
            <MasterDetail enabled render={renderDeliveryLinesDetail} />
            <FilterRow visible />
            <Column dataField="createdAt" dataType="datetime" caption="When" width={132} />
            <Column dataField="destinationSummary" caption="Destination" minWidth={160} />
            <Column dataField="lineCount" caption="#" width={40} dataType="number" />
            <Column
              dataField="grandTotal"
              caption="Total"
              dataType="number"
              format="#,##0.00"
              width={92}
            />
            <Column dataField="createdByName" caption="Created by" width={110} minWidth={80} />
            <Column
              type="buttons"
              cssClass="grid-actions-column"
              width={72}
              allowResizing={false}
              allowFiltering={false}
              allowHeaderFiltering={false}
            >
              <ColumnButton
                hint="Reprint bon"
                icon="print"
                onClick={(e) => {
                  const row = e.row?.data as DeliveryListRow | undefined;
                  if (row) void reprintDelivery(row);
                }}
              />
            </Column>
            <Paging defaultPageSize={25} />
            <Pager showPageSizeSelector showInfo />
          </AppDataGrid>
        </div>

        <Popup
          visible={popupOpen}
          onHiding={closePopup}
          showTitle
          title="New delivery"
          width={1280}
          height="auto"
          maxHeight="92vh"
          showCloseButton
        >
          <div className="purchase-form">
            <div className="purchase-form__section-title">Destination</div>
            <div className="purchase-form__grid2">
              <div className="purchase-form__field">
                <span className="purchase-form__label">Type</span>
                <div className="purchase-form__control">
                  <SelectBox
                    dataSource={[...DEST_OPTIONS]}
                    displayExpr="text"
                    valueExpr="value"
                    value={destination}
                    onValueChanged={(e) => {
                      const v = (e.value as (typeof DEST_OPTIONS)[number]["value"]) ?? "PERSONNEL_BIN";
                      setDestination(v);
                      setTargetPersonnelId(null);
                      setTargetSiteId(null);
                      setDepartmentId(null);
                    }}
                    searchEnabled={false}
                    showClearButton={false}
                  />
                </div>
              </div>

              {destination === "PERSONNEL_BIN" ? (
                <div className="purchase-form__field">
                  <span className="purchase-form__label">Personnel</span>
                  <div className="purchase-form__control">
                    <SelectBox
                      dataSource={personnelOptions}
                      displayExpr="label"
                      valueExpr="id"
                      value={targetPersonnelId}
                      onValueChanged={(e) => setTargetPersonnelId(e.value ?? null)}
                      searchEnabled
                      showClearButton
                      placeholder="Select personnel…"
                    />
                  </div>
                </div>
              ) : null}

              {destination === "SITE_BIN" ? (
                <div className="purchase-form__field">
                  <span className="purchase-form__label">Site</span>
                  <div className="purchase-form__control">
                    <SelectBox
                      dataSource={sites}
                      displayExpr="label"
                      valueExpr="id"
                      value={targetSiteId}
                      onValueChanged={(e) => setTargetSiteId(e.value ?? null)}
                      searchEnabled
                      showClearButton
                      placeholder="Select site…"
                    />
                  </div>
                </div>
              ) : null}

              {destination === "DEPARTMENT" ? (
                <div className="purchase-form__field">
                  <span className="purchase-form__label">Department</span>
                  <div className="purchase-form__control">
                    <SelectBox
                      dataSource={departments}
                      displayExpr="label"
                      valueExpr="id"
                      value={departmentId}
                      onValueChanged={(e) => setDepartmentId(e.value ?? null)}
                      searchEnabled
                      showClearButton
                      placeholder="Select department…"
                    />
                  </div>
                </div>
              ) : null}
            </div>

            <div className="purchase-form__field">
              <span className="purchase-form__label">Document notes</span>
              <div className="purchase-form__control">
                <TextArea
                  value={notes}
                  onValueChanged={(e) => setNotes(e.value ?? "")}
                  height={72}
                  maxLength={2000}
                />
              </div>
            </div>

            <div className="purchase-form__section-title">Products</div>
            <div className="purchase-form__lines">
              <div className="purchase-form__lines-header">
                <span>#</span>
                <span>Product</span>
                <span>Qty</span>
                <span>Price source</span>
                <span>Unit price</span>
                <span>Line total</span>
                <span />
              </div>

              {lines.map((line, idx) => {
                const product = line.productId ? productById.get(line.productId) : undefined;
                const lineTotal = line.quantity * (Number.isFinite(line.unitPrice) ? line.unitPrice : 0);
                const priceEditable = line.priceSource === "MANUAL";
                return (
                  <div className="purchase-form__line-row" key={line.key}>
                    <span className="purchase-form__line-num">{idx + 1}</span>
                    <div className="purchase-form__control">
                      <SelectBox
                        dataSource={productOptions}
                        displayExpr="label"
                        valueExpr="id"
                        value={line.productId}
                        onValueChanged={(e) => updateLine(line.key, { productId: e.value ?? null })}
                        searchEnabled
                        showClearButton
                        placeholder="Select product…"
                      />
                    </div>
                    <div className="purchase-form__control">
                      <NumberBox
                        value={line.quantity}
                        min={0.0001}
                        format="#,##0.####"
                        onValueChanged={(e) =>
                          updateLine(line.key, { quantity: Number(e.value) || 0 })
                        }
                      />
                    </div>
                    <div className="purchase-form__control">
                      <SelectBox
                        dataSource={[...PRICE_SOURCE_OPTIONS]}
                        displayExpr="text"
                        valueExpr="value"
                        value={line.priceSource}
                        onValueChanged={(e) =>
                          updateLine(line.key, {
                            priceSource: (e.value as PriceSource) ?? "LAST_PURCHASE",
                          })
                        }
                        searchEnabled={false}
                        showClearButton={false}
                      />
                    </div>
                    <div className="purchase-form__control">
                      <NumberBox
                        value={line.unitPrice}
                        min={0}
                        format="#,##0.00####"
                        readOnly={!priceEditable}
                        onValueChanged={(e) =>
                          updateLine(line.key, { unitPrice: Number(e.value) || 0 })
                        }
                      />
                    </div>
                    <span className="purchase-form__line-total">
                      {lineTotal.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                    <Button
                      icon="trash"
                      stylingMode="text"
                      hint="Remove line"
                      disabled={lines.length <= 1}
                      onClick={() => removeLine(line.key)}
                    />
                    {product && line.quantity > product.quantityOnHand ? (
                      <span
                        className="purchase-form__hint"
                        style={{ gridColumn: "1 / -1", color: "#c62828" }}
                      >
                        Insufficient stock: {product.quantityOnHand} on hand
                      </span>
                    ) : null}
                  </div>
                );
              })}

              <div className="purchase-form__lines-footer">
                <Button text="Add line" icon="add" stylingMode="text" onClick={addLine} />
                <span>
                  Grand total:{" "}
                  <strong>
                    {linesGrandTotal.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </strong>
                </span>
              </div>
            </div>

            <div className="purchase-form__actions">
              <Button text="Cancel" stylingMode="text" onClick={closePopup} disabled={submitting} />
              <Button
                text="Save & print bon"
                type="default"
                stylingMode="contained"
                icon="save"
                disabled={submitting}
                onClick={() => void submitDelivery()}
              />
            </div>
          </div>
        </Popup>
      </div>
    </PageReadGuard>
  );
}
