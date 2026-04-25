import { useCallback, useEffect, useMemo, useState } from "react";
import CustomStore from "devextreme/data/custom_store";
import {
  Column,
  Paging,
  Pager,
  FilterRow,
  ColumnButton,
  Item as GridToolbarItem,
} from "devextreme-react/data-grid";
import Button from "devextreme-react/button";
import Popup from "devextreme-react/popup";
import SelectBox from "devextreme-react/select-box";
import TextArea from "devextreme-react/text-area";
import NumberBox from "devextreme-react/number-box";
import notify from "devextreme/ui/notify";
import { AppDataGrid } from "../components/app-data-grid";
import { apiFetch, apiFetchBlob } from "../api/client";
import { getDataGridErrorMessage, getErrorMessage } from "../utils/error-message";

type PersonnelRow = {
  id: string;
  fullName: string;
  siteLabel: string;
  canAuthorizePurchases: boolean;
  isBuyer: boolean;
};

type ProductRow = { id: string; sku: string; name: string };

type SupplierRow = { id: string; name: string };

type PurchaseListRow = {
  id: string;
  destination: string;
  status: string;
  supplierName: string;
  bonOriginalName: string;
  notes: string | null;
  createdAt: string;
  authorizedByName: string;
  buyerName: string;
  targetPersonnelName: string | null;
  createdByName: string;
  lineCount: number;
  totalAmount: number;
};

type PurchaseDetailLine = {
  id: string;
  productId: string;
  sku: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  lineIndex: number;
  lineTotal: number;
};

type PurchaseDetail = {
  id: string;
  destination: "STOCK" | "PERSONNEL_BIN";
  status: "PENDING" | "COMPLETE" | "CANCELLED";
  supplier: { id: string; name: string };
  bonOriginalName: string;
  notes: string | null;
  authorizedBy: { id: string; firstName: string; lastName: string };
  buyerPersonnel: { id: string; firstName: string; lastName: string };
  targetPersonnel: { id: string; firstName: string; lastName: string } | null;
  lines: PurchaseDetailLine[];
};

type LineDraft = { productId: string | null; quantity: number; unitPrice: number };

const DEST_OPTIONS = [
  { value: "STOCK", text: "Receive to stock (warehouse)" },
  { value: "PERSONNEL_BIN", text: "Direct to personal bin (no warehouse stock)" },
];

const STATUS_OPTIONS = [
  { value: "PENDING", text: "Pending" },
  { value: "COMPLETE", text: "Complete" },
  { value: "CANCELLED", text: "Cancelled" },
];

function statusLabel(s: string): string {
  if (s === "COMPLETE") return "Complete";
  if (s === "CANCELLED") return "Cancelled";
  return "Pending";
}

function statusHint(s: "PENDING" | "COMPLETE" | "CANCELLED"): string {
  if (s === "PENDING") {
    return "No warehouse or bin change until you set status to Complete.";
  }
  if (s === "COMPLETE") {
    return "Inventory has been (or will be) applied for this purchase.";
  }
  return "";
}

/** Explains what saving an edit updates (DB + inventory + derived views). */
function buildPurchaseEditConfirmMessage(
  destination: "STOCK" | "PERSONNEL_BIN" | null,
  statusWhenLoaded: "PENDING" | "COMPLETE" | "CANCELLED",
  nextStatus: "PENDING" | "COMPLETE" | "CANCELLED",
): string {
  const destLabel =
    destination === "STOCK"
      ? "Warehouse (stock)"
      : destination === "PERSONNEL_BIN"
        ? "Personal bin (direct to assignee)"
        : "Unknown destination";

  const lines: string[] = [
    "Save changes to this purchase?",
    "",
    "The server will update:",
    "• This purchase row (supplier, authorizer, buyer, status, notes, receipt file when replaced).",
    "• All line items and unit prices on this purchase (unless you are cancelling a completed purchase — see below).",
    "",
    "When this purchase is or becomes Complete, linked inventory is kept in sync:",
  ];

  if (destination === "STOCK") {
    lines.push(
      "• Warehouse: StockMovement rows tied to this purchase and each product’s quantity on hand. Product stock statements and the Stock page read from those movements.",
    );
  } else if (destination === "PERSONNEL_BIN") {
    lines.push(
      "• Personal bin: PersonnelBinItem quantities for the recipient (no warehouse on-hand change for this flow).",
    );
  }

  lines.push(
    "",
    "Supplier purchase history and product purchase-price history are built from this purchase and its lines, so they will reflect your updates.",
    "",
    `Current destination when opened: ${destLabel}.`,
  );

  if (statusWhenLoaded === "COMPLETE" && nextStatus === "CANCELLED") {
    lines.push(
      "",
      "You are cancelling a completed purchase: warehouse or bin quantities from this purchase will be reversed, and line items cannot be changed in the same save.",
    );
  } else if (statusWhenLoaded === "PENDING" && nextStatus === "COMPLETE") {
    lines.push(
      "",
      "You are completing this purchase: warehouse or bin quantities will be applied according to the destination.",
    );
  }

  lines.push("", "Continue?");
  return lines.join("\n");
}

export default function PurchasesPage() {
  const [popupOpen, setPopupOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [personnel, setPersonnel] = useState<PersonnelRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [authorizerId, setAuthorizerId] = useState<string | null>(null);
  const [buyerId, setBuyerId] = useState<string | null>(null);
  const [status, setStatus] = useState<"PENDING" | "COMPLETE" | "CANCELLED">("PENDING");
  const [destination, setDestination] = useState<"STOCK" | "PERSONNEL_BIN" | null>(null);
  const [targetPersonnelId, setTargetPersonnelId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([
    { productId: null, quantity: 1, unitPrice: 0 },
  ]);
  const [bonFile, setBonFile] = useState<File | null>(null);
  const [existingBonName, setExistingBonName] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [gridRefresh, setGridRefresh] = useState(0);
  /** Status when the edit form was opened (used for cancel-complete PATCH rules). */
  const [statusWhenLoaded, setStatusWhenLoaded] = useState<
    "PENDING" | "COMPLETE" | "CANCELLED" | null
  >(null);

  const isEdit = editingId !== null;
  /** Record was cancelled before open; block edits. Choosing Cancelled in the form (e.g. from Complete) is allowed. */
  const isAlreadyCancelled = isEdit && statusWhenLoaded === "CANCELLED";
  /** Cancelling a completed purchase: API rejects lines in the same request; line edits are ignored. */
  const lineEditsDisabledForCancelComplete =
    isEdit && statusWhenLoaded === "COMPLETE" && status === "CANCELLED";

  const loadMeta = useCallback(async () => {
    const [pl, pr, su] = await Promise.all([
      apiFetch("/api/personnel") as Promise<PersonnelRow[]>,
      apiFetch("/api/products") as Promise<ProductRow[]>,
      apiFetch("/api/suppliers") as Promise<SupplierRow[]>,
    ]);
    setPersonnel(pl);
    setProducts(pr);
    setSuppliers(su);
  }, []);

  useEffect(() => {
    loadMeta().catch((e: unknown) => {
      notify(getErrorMessage(e, "Failed to load options"), "error", 5000);
    });
  }, [loadMeta]);

  const authorizerOptions = useMemo(() => {
    const allowed = personnel
      .filter((p) => p.canAuthorizePurchases)
      .map((p) => ({
        id: p.id,
        label: `${p.fullName} — ${p.siteLabel}`,
      }));
    if (!authorizerId) {
      return allowed;
    }
    if (allowed.some((o) => o.id === authorizerId)) {
      return allowed;
    }
    const current = personnel.find((p) => p.id === authorizerId);
    if (!current) {
      return allowed;
    }
    return [
      { id: current.id, label: `${current.fullName} — ${current.siteLabel}` },
      ...allowed.filter((o) => o.id !== authorizerId),
    ];
  }, [personnel, authorizerId]);

  const buyerOptions = useMemo(() => {
    const allowed = personnel
      .filter((p) => p.isBuyer)
      .map((p) => ({
        id: p.id,
        label: `${p.fullName} — ${p.siteLabel}`,
      }));
    if (!buyerId) {
      return allowed;
    }
    if (allowed.some((o) => o.id === buyerId)) {
      return allowed;
    }
    const current = personnel.find((p) => p.id === buyerId);
    if (!current) {
      return allowed;
    }
    return [
      { id: current.id, label: `${current.fullName} — ${current.siteLabel}` },
      ...allowed.filter((o) => o.id !== buyerId),
    ];
  }, [personnel, buyerId]);

  const supplierOptions = useMemo(
    () =>
      suppliers.map((s) => ({
        id: s.id,
        label: s.name,
      })),
    [suppliers],
  );

  const targetPersonnelOptions = useMemo(
    () =>
      personnel.map((p) => ({
        id: p.id,
        label: `${p.fullName} — ${p.siteLabel}`,
      })),
    [personnel],
  );

  const productOptions = useMemo(
    () =>
      products.map((p) => ({
        id: p.id,
        label: `${p.sku} — ${p.name}`,
      })),
    [products],
  );

  const dataSource = useMemo(
    () =>
      new CustomStore({
        key: "id",
        load: () => apiFetch("/api/purchases") as Promise<PurchaseListRow[]>,
      }),
    [],
  );

  const resetForm = useCallback(() => {
    setSupplierId(null);
    setAuthorizerId(null);
    setBuyerId(null);
    setStatus("PENDING");
    setDestination(null);
    setTargetPersonnelId(null);
    setNotes("");
    setLines([{ productId: null, quantity: 1, unitPrice: 0 }]);
    setBonFile(null);
    setExistingBonName(null);
    setEditingId(null);
    setStatusWhenLoaded(null);
  }, []);

  const openCreate = useCallback(() => {
    resetForm();
    setPopupOpen(true);
  }, [resetForm]);

  const applyDetailToForm = useCallback((d: PurchaseDetail) => {
    setEditingId(d.id);
    setSupplierId(d.supplier.id);
    setAuthorizerId(d.authorizedBy.id);
    setBuyerId(d.buyerPersonnel.id);
    setStatus(d.status);
    setDestination(d.destination);
    setTargetPersonnelId(d.targetPersonnel?.id ?? null);
    setNotes(d.notes ?? "");
    setLines(
      d.lines.length > 0
        ? d.lines.map((l) => ({
            productId: l.productId,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
          }))
        : [{ productId: null, quantity: 1, unitPrice: 0 }],
    );
    setBonFile(null);
    setExistingBonName(d.bonOriginalName);
    setStatusWhenLoaded(d.status);
  }, []);

  const openEdit = useCallback(
    async (row: PurchaseListRow) => {
      try {
        const d = (await apiFetch(`/api/purchases/${row.id}`)) as PurchaseDetail;
        applyDetailToForm(d);
        setPopupOpen(true);
      } catch (e: unknown) {
        notify(getErrorMessage(e, "Failed to load purchase"), "error", 5000);
      }
    },
    [applyDetailToForm],
  );

  const closePopup = useCallback(() => {
    setPopupOpen(false);
    setEditingId(null);
    setExistingBonName(null);
    setBonFile(null);
    setStatusWhenLoaded(null);
  }, []);

  const addLine = useCallback(() => {
    setLines((prev) => [...prev, { productId: null, quantity: 1, unitPrice: 0 }]);
  }, []);

  const removeLine = useCallback((index: number) => {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }, []);

  const updateLine = useCallback((index: number, patch: Partial<LineDraft>) => {
    setLines((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }, []);

  const submitPurchase = useCallback(async () => {
    if (isAlreadyCancelled) {
      notify("This purchase is cancelled and cannot be edited.", "warning", 3000);
      return;
    }
    if (!supplierId) {
      notify("Select a supplier", "warning", 2500);
      return;
    }
    if (!authorizerId) {
      notify("Select who authorized the purchase", "warning", 2500);
      return;
    }
    if (!buyerId) {
      notify("Select the buyer (personnel)", "warning", 2500);
      return;
    }
    if (!destination) {
      notify("Select a destination", "warning", 2500);
      return;
    }
    if (destination === "PERSONNEL_BIN" && !targetPersonnelId) {
      notify("Select target personnel for personal bin", "warning", 2500);
      return;
    }
    if (!isEdit && !bonFile) {
      notify("Upload a bon (receipt)", "warning", 2500);
      return;
    }
    const payloadLines = lines
      .filter((l) => l.productId && l.quantity > 0)
      .map((l) => ({
        productId: l.productId as string,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
      }));
    if (payloadLines.length === 0) {
      notify("Add at least one product line", "warning", 2500);
      return;
    }

    if (isEdit && editingId && statusWhenLoaded) {
      const ok = window.confirm(
        buildPurchaseEditConfirmMessage(destination, statusWhenLoaded, status),
      );
      if (!ok) {
        return;
      }
    }

    const omitLinesFromPatch =
      Boolean(isEdit && statusWhenLoaded === "COMPLETE" && status === "CANCELLED");

    setSubmitting(true);
    try {
      if (isEdit && editingId) {
        if (bonFile) {
          const fd = new FormData();
          fd.append("authorizedByPersonnelId", authorizerId);
          fd.append("buyerPersonnelId", buyerId);
          fd.append("supplierId", supplierId);
          fd.append("status", status);
          if (!omitLinesFromPatch) {
            fd.append("lines", JSON.stringify(payloadLines));
          }
          fd.append("notes", notes.trim());
          if (destination === "PERSONNEL_BIN" && targetPersonnelId) {
            fd.append("targetPersonnelId", targetPersonnelId);
          }
          fd.append("bon", bonFile);
          await apiFetch(`/api/purchases/${editingId}`, { method: "PATCH", body: fd });
        } else {
          const body: Record<string, unknown> = {
            authorizedByPersonnelId: authorizerId,
            buyerPersonnelId: buyerId,
            supplierId,
            status,
            notes: notes.trim() || null,
          };
          if (!omitLinesFromPatch) {
            body.lines = payloadLines;
          }
          if (destination === "PERSONNEL_BIN") {
            body.targetPersonnelId = targetPersonnelId;
          }
          await apiFetch(`/api/purchases/${editingId}`, {
            method: "PATCH",
            body: JSON.stringify(body),
          });
        }
        notify("Purchase updated", "success", 2000);
      } else {
        const fd = new FormData();
        fd.append("authorizedByPersonnelId", authorizerId);
        fd.append("buyerPersonnelId", buyerId);
        fd.append("supplierId", supplierId);
        fd.append("destination", destination);
        fd.append("status", status);
        if (destination === "PERSONNEL_BIN" && targetPersonnelId) {
          fd.append("targetPersonnelId", targetPersonnelId);
        }
        if (notes.trim()) {
          fd.append("notes", notes.trim());
        }
        fd.append("lines", JSON.stringify(payloadLines));
        fd.append("bon", bonFile!);
        await apiFetch("/api/purchases", { method: "POST", body: fd });
        notify("Purchase recorded", "success", 2000);
      }
      closePopup();
      resetForm();
      setGridRefresh((k) => k + 1);
    } catch (e: unknown) {
      notify(getErrorMessage(e, "Failed to save purchase"), "error", 5000);
    } finally {
      setSubmitting(false);
    }
  }, [
    supplierId,
    authorizerId,
    buyerId,
    status,
    destination,
    targetPersonnelId,
    notes,
    lines,
    bonFile,
    isEdit,
    editingId,
    closePopup,
    resetForm,
    isAlreadyCancelled,
    statusWhenLoaded,
  ]);

  const deletePurchase = useCallback(
    async (row: PurchaseListRow) => {
      const ok = window.confirm(
        "Delete this purchase? If it was completed, warehouse stock or personal bin quantities will be reversed.",
      );
      if (!ok) return;
      try {
        await apiFetch(`/api/purchases/${row.id}`, { method: "DELETE" });
        notify("Purchase deleted", "success", 2000);
        setGridRefresh((k) => k + 1);
      } catch (e: unknown) {
        notify(getErrorMessage(e, "Delete failed"), "error", 5000);
      }
    },
    [],
  );

  const downloadBon = useCallback(async (row: PurchaseListRow) => {
    try {
      const blob = await apiFetchBlob(`/api/purchases/${row.id}/bon`);
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

  const formDisabled = isAlreadyCancelled;

  const linesGrandTotal = useMemo(
    () =>
      lines.reduce((sum, l) => sum + l.quantity * (Number.isFinite(l.unitPrice) ? l.unitPrice : 0), 0),
    [lines],
  );

  const linesLocked = formDisabled || lineEditsDisabledForCancelComplete;

  const popupTitle = isEdit ? "Edit purchase" : "New purchase";
  const bonChosenLabel = bonFile?.name ?? null;

  return (
    <div className="content-block content-block--fill">
      <div className="page-toolbar">
        <h2>Purchases</h2>
      </div>

      <div className="page-grid-body">
        <AppDataGrid
          key={gridRefresh}
          persistenceKey="itm-grid-purchases"
          dataSource={dataSource}
          repaintChangesOnly
          height="100%"
          showAddRowButton={false}
          toolbarItems={
            <GridToolbarItem
              location="before"
              widget="dxButton"
              options={{
                text: "Record purchase",
                type: "default",
                stylingMode: "contained",
                icon: "add",
                onClick: () => openCreate(),
              }}
            />
          }
          onDataErrorOccurred={(e) => {
            notify(getDataGridErrorMessage(e), "error", 5000);
          }}
        >
          <FilterRow visible />
          <Column dataField="createdAt" dataType="datetime" caption="When" width={138} />
          <Column
            dataField="status"
            caption="Status"
            width={96}
            calculateCellValue={(row: PurchaseListRow) => statusLabel(row.status)}
          />
          <Column dataField="supplierName" caption="Supplier" width={140} />
          <Column
            dataField="destination"
            caption="Dest"
            width={72}
            calculateCellValue={(row: PurchaseListRow) =>
              row.destination === "STOCK" ? "Stock" : "Bin"
            }
          />
          <Column dataField="authorizedByName" caption="Authorized by" width={120} />
          <Column dataField="buyerName" caption="Buyer" width={120} />
          <Column dataField="targetPersonnelName" caption="Bin recipient" width={120} />
          <Column dataField="lineCount" caption="#" width={44} dataType="number" />
          <Column
            dataField="totalAmount"
            caption="Total"
            dataType="number"
            format="#,##0.00"
            width={100}
          />
          <Column dataField="createdByName" caption="Recorded by" width={120} />
          <Column dataField="bonOriginalName" caption="Bon" width={140} />
          <Column type="buttons" width={132}>
            <ColumnButton
              hint="Edit"
              icon="edit"
              text="Edit"
              onClick={(e) => {
                const row = e.row?.data as PurchaseListRow | undefined;
                if (row) void openEdit(row);
              }}
            />
            <ColumnButton
              hint="Download bon"
              icon="download"
              text="Bon"
              onClick={(e) => {
                const row = e.row?.data as PurchaseListRow | undefined;
                if (row) {
                  void downloadBon(row);
                }
              }}
            />
            <ColumnButton
              hint="Delete"
              icon="trash"
              text="Del"
              onClick={(e) => {
                const row = e.row?.data as PurchaseListRow | undefined;
                if (row) void deletePurchase(row);
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
        title={popupTitle}
        width={820}
        height="auto"
        maxHeight="92vh"
        showCloseButton
      >
        <div className="purchase-form">
          {isAlreadyCancelled ? (
            <div className="purchase-form__alert" role="status">
              This purchase is cancelled. You can close this window or download the receipt from the
              grid; editing is disabled.
            </div>
          ) : null}

          <div className="purchase-form__section-title">Supplier and workflow</div>
          <div className="purchase-form__grid2">
            <div className="purchase-form__field">
              <span className="purchase-form__label">Supplier</span>
              <div className="purchase-form__control">
                <SelectBox
                  dataSource={supplierOptions}
                  displayExpr="label"
                  valueExpr="id"
                  value={supplierId}
                  onValueChanged={(e) => setSupplierId(e.value ?? null)}
                  searchEnabled
                  showDropDownButton
                  showClearButton
                  placeholder="Select supplier…"
                  disabled={formDisabled}
                />
              </div>
            </div>
            <div className="purchase-form__field">
              <span className="purchase-form__label">Status</span>
              {statusHint(status) ? (
                <p className="purchase-form__hint">{statusHint(status)}</p>
              ) : null}
              <div className="purchase-form__control">
                <SelectBox
                  dataSource={STATUS_OPTIONS}
                  displayExpr="text"
                  valueExpr="value"
                  value={status}
                  onValueChanged={(e) =>
                    setStatus((e.value as "PENDING" | "COMPLETE" | "CANCELLED") ?? "PENDING")
                  }
                  searchEnabled
                  showClearButton={false}
                  disabled={formDisabled}
                />
              </div>
            </div>
          </div>

          <div className="purchase-form__section-title">People</div>
          <div className="purchase-form__grid2">
            <div className="purchase-form__field">
              <span className="purchase-form__label">Authorized by</span>
              <p className="purchase-form__hint">Person who signed off on the receipt (bon).</p>
              <div className="purchase-form__control">
                <SelectBox
                  dataSource={authorizerOptions}
                  displayExpr="label"
                  valueExpr="id"
                  value={authorizerId}
                  onValueChanged={(e) => setAuthorizerId(e.value ?? null)}
                  searchEnabled
                  showDropDownButton
                  showClearButton
                  placeholder="Select authorizer…"
                  disabled={formDisabled}
                />
              </div>
            </div>
            <div className="purchase-form__field">
              <span className="purchase-form__label">Buyer</span>
              <p className="purchase-form__hint">Personnel flagged as Buyer in the directory.</p>
              <div className="purchase-form__control">
                <SelectBox
                  dataSource={buyerOptions}
                  displayExpr="label"
                  valueExpr="id"
                  value={buyerId}
                  onValueChanged={(e) => setBuyerId(e.value ?? null)}
                  searchEnabled
                  showDropDownButton
                  showClearButton
                  placeholder="Select buyer…"
                  disabled={formDisabled}
                />
              </div>
            </div>
          </div>

          <div className="purchase-form__section-title">Receiving</div>
          <div
            className={
              destination === "PERSONNEL_BIN" ? "purchase-form__grid2" : undefined
            }
            style={destination === "PERSONNEL_BIN" ? undefined : { maxWidth: 520 }}
          >
            <div className="purchase-form__field">
              <span className="purchase-form__label">Destination</span>
              <p className="purchase-form__hint">
                {isEdit
                  ? "Destination is fixed after the purchase is created."
                  : "Warehouse stock vs. direct assignment to a personal bin."}
              </p>
              <div className="purchase-form__control">
                <SelectBox
                  dataSource={DEST_OPTIONS}
                  displayExpr="text"
                  valueExpr="value"
                  value={destination}
                  onValueChanged={(e) =>
                    setDestination((e.value as "STOCK" | "PERSONNEL_BIN" | null) ?? null)
                  }
                  searchEnabled
                  showClearButton
                  placeholder="Select destination…"
                  disabled={isEdit || formDisabled}
                />
              </div>
            </div>
            {destination === "PERSONNEL_BIN" ? (
              <div className="purchase-form__field">
                <span className="purchase-form__label">Personal bin recipient</span>
                <p className="purchase-form__hint">Who receives the items in their bin (not warehouse stock).</p>
                <div className="purchase-form__control">
                  <SelectBox
                    dataSource={targetPersonnelOptions}
                    displayExpr="label"
                    valueExpr="id"
                    value={targetPersonnelId}
                    onValueChanged={(e) => setTargetPersonnelId(e.value ?? null)}
                    searchEnabled
                    showDropDownButton
                    showClearButton
                    placeholder="Select personnel…"
                    disabled={formDisabled}
                  />
                </div>
              </div>
            ) : null}
          </div>

          <div className="purchase-form__section-title">Receipt and notes</div>
          <div className="purchase-form__field">
            <span className="purchase-form__label">Receipt file (bon)</span>
            <p className="purchase-form__hint">
              {isEdit
                ? "Upload a new file only if you need to replace the stored receipt. PDF or image."
                : "Required. PDF or image (JPEG, PNG, WebP, GIF)."}
            </p>
            <div className="purchase-form__bon">
              {isEdit && existingBonName ? (
                <div className="purchase-form__bon-meta">
                  <strong>On file:</strong> {existingBonName}
                </div>
              ) : null}
              <div className="purchase-form__bon-actions">
                <input
                  type="file"
                  className="purchase-form__bon-file"
                  accept=".pdf,image/*"
                  disabled={formDisabled}
                  onChange={(ev) => setBonFile(ev.target.files?.[0] ?? null)}
                />
                {bonChosenLabel ? (
                  <span className="purchase-form__bon-meta">
                    <strong>Selected:</strong> {bonChosenLabel}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          <div className="purchase-form__field" style={{ marginTop: 14 }}>
            <span className="purchase-form__label">Internal notes</span>
            <p className="purchase-form__hint">Optional context for your team (not printed on the bon).</p>
            <div className="purchase-form__control">
              <TextArea
                value={notes}
                onValueChanged={(e) => setNotes(e.value ?? "")}
                height={72}
                maxLength={4000}
                disabled={formDisabled}
              />
            </div>
          </div>

          <div className="purchase-form__section-title">Line items</div>
          <p className="purchase-form__hint" style={{ marginTop: -6, marginBottom: 10 }}>
            {lineEditsDisabledForCancelComplete ? (
              <>
                Line items cannot be edited while cancelling a completed purchase in the same save. The
                server will reverse inventory from the lines already on file.
              </>
            ) : isEdit ? (
              <>
                Changing products, quantities, or prices on a <strong>completed</strong> purchase updates
                linked <strong>stock movements</strong> and <strong>on-hand</strong> amounts (warehouse), or{" "}
                <strong>personal bin</strong> quantities (direct bin), so product statements, the Stock
                page, and purchase history stay consistent.
              </>
            ) : (
              <>Enter quantity and unit price per line. Totals use quantity × unit price.</>
            )}
          </p>
          <div className="purchase-form__lines">
            <div className="purchase-form__lines-header" aria-hidden>
              <span>#</span>
              <span>Product</span>
              <span>Qty</span>
              <span>Unit</span>
              <span>Total</span>
              <span />
            </div>
            {lines.map((line, index) => (
              <div className="purchase-form__line-row" key={index}>
                <span className="purchase-form__line-num">{index + 1}</span>
                <div className="purchase-form__control">
                  <SelectBox
                    dataSource={productOptions}
                    displayExpr="label"
                    valueExpr="id"
                    value={line.productId}
                    onValueChanged={(e) => updateLine(index, { productId: e.value ?? null })}
                    searchEnabled
                    showDropDownButton
                    showClearButton
                    placeholder="Product…"
                    disabled={linesLocked}
                  />
                </div>
                <div className="purchase-form__control">
                  <NumberBox
                    value={line.quantity}
                    min={0.0001}
                    format="#,##0.####"
                    showSpinButtons
                    disabled={linesLocked}
                    onValueChanged={(e) =>
                      updateLine(index, { quantity: typeof e.value === "number" ? e.value : 1 })
                    }
                  />
                </div>
                <div className="purchase-form__control">
                  <NumberBox
                    value={line.unitPrice}
                    min={0}
                    format="#,##0.00"
                    showSpinButtons
                    disabled={linesLocked}
                    onValueChanged={(e) =>
                      updateLine(index, {
                        unitPrice: typeof e.value === "number" ? e.value : 0,
                      })
                    }
                  />
                </div>
                <span className="purchase-form__line-total">
                  {(line.quantity * (Number.isFinite(line.unitPrice) ? line.unitPrice : 0)).toFixed(2)}
                </span>
                <Button
                  icon="trash"
                  stylingMode="text"
                  hint="Remove line"
                  onClick={() => removeLine(index)}
                  disabled={linesLocked || lines.length <= 1}
                />
              </div>
            ))}
            <div className="purchase-form__lines-footer">
              <Button
                text="Add line"
                icon="add"
                stylingMode="outlined"
                type="default"
                onClick={addLine}
                disabled={linesLocked}
              />
              <div>
                <span className="purchase-form__hint" style={{ margin: 0, textAlign: "right" }}>
                  Document total
                </span>
                <div>
                  <strong>{linesGrandTotal.toFixed(2)}</strong>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="purchase-form__actions">
          <Button text="Cancel" stylingMode="outlined" onClick={closePopup} />
          <Button
            text={isEdit ? "Save changes" : "Save purchase"}
            type="default"
            stylingMode="contained"
            disabled={submitting || formDisabled}
            onClick={() => void submitPurchase()}
          />
        </div>
      </Popup>
    </div>
  );
}
