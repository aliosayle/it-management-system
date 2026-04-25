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

  const isEdit = editingId !== null;
  const isCancelled = status === "CANCELLED";

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
    if (isCancelled) {
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

    setSubmitting(true);
    try {
      if (isEdit && editingId) {
        if (bonFile) {
          const fd = new FormData();
          fd.append("authorizedByPersonnelId", authorizerId);
          fd.append("buyerPersonnelId", buyerId);
          fd.append("supplierId", supplierId);
          fd.append("status", status);
          fd.append("lines", JSON.stringify(payloadLines));
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
            lines: payloadLines,
          };
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
    isCancelled,
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

  const formDisabled = isCancelled;

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
        title={isEdit ? "Edit purchase" : "Record purchase"}
        width={640}
        height="auto"
        showCloseButton
      >
        <div className="dx-fieldset" style={{ paddingTop: 8 }}>
          {isCancelled ? (
            <div style={{ marginBottom: 8, color: "var(--base-danger, #c62828)" }}>
              This purchase is cancelled. You can download the bon or close; changes are disabled.
            </div>
          ) : null}
          <div className="dx-field">
            <span className="dx-field-label">Supplier</span>
            <SelectBox
              dataSource={supplierOptions}
              displayExpr="label"
              valueExpr="id"
              value={supplierId}
              onValueChanged={(e) => setSupplierId(e.value ?? null)}
              searchEnabled
              showDropDownButton
              showClearButton
              placeholder="Search supplier…"
              disabled={formDisabled}
            />
          </div>
          <div className="dx-field">
            <span className="dx-field-label">Authorized by (personnel)</span>
            <SelectBox
              dataSource={authorizerOptions}
              displayExpr="label"
              valueExpr="id"
              value={authorizerId}
              onValueChanged={(e) => setAuthorizerId(e.value ?? null)}
              searchEnabled
              showDropDownButton
              showClearButton
              placeholder="Search authorized personnel…"
              disabled={formDisabled}
            />
          </div>
          <div className="dx-field">
            <span className="dx-field-label">Buyer (personnel)</span>
            <SelectBox
              dataSource={buyerOptions}
              displayExpr="label"
              valueExpr="id"
              value={buyerId}
              onValueChanged={(e) => setBuyerId(e.value ?? null)}
              searchEnabled
              showDropDownButton
              showClearButton
              placeholder="Search buyers…"
              disabled={formDisabled}
            />
          </div>
          <div className="dx-field">
            <span className="dx-field-label">Status</span>
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
          <div className="dx-field">
            <span className="dx-field-label">Destination</span>
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
              placeholder="Choose destination…"
              disabled={isEdit || formDisabled}
            />
          </div>
          {destination === "PERSONNEL_BIN" ? (
            <div className="dx-field">
              <span className="dx-field-label">Personal bin for</span>
              <SelectBox
                dataSource={targetPersonnelOptions}
                displayExpr="label"
                valueExpr="id"
                value={targetPersonnelId}
                onValueChanged={(e) => setTargetPersonnelId(e.value ?? null)}
                searchEnabled
                showDropDownButton
                showClearButton
                placeholder="Search personnel…"
                disabled={formDisabled}
              />
            </div>
          ) : null}
          <div className="dx-field">
            <span className="dx-field-label">
              Bon (PDF or image){isEdit ? " — optional to replace" : ""}
            </span>
            {isEdit && existingBonName ? (
              <div style={{ fontSize: 12, marginBottom: 4 }}>Current: {existingBonName}</div>
            ) : null}
            <input
              type="file"
              accept=".pdf,image/*"
              disabled={formDisabled}
              onChange={(ev) => setBonFile(ev.target.files?.[0] ?? null)}
            />
          </div>
          <div className="dx-field">
            <span className="dx-field-label">Notes</span>
            <TextArea
              value={notes}
              onValueChanged={(e) => setNotes(e.value ?? "")}
              height={56}
              readOnly={formDisabled}
            />
          </div>
          <div style={{ marginBottom: 6, fontWeight: 600 }}>Lines</div>
          {lines.map((line, index) => (
            <div
              key={index}
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                marginBottom: 6,
                flexWrap: "wrap",
              }}
            >
              <SelectBox
                width={260}
                dataSource={productOptions}
                displayExpr="label"
                valueExpr="id"
                value={line.productId}
                onValueChanged={(e) => updateLine(index, { productId: e.value ?? null })}
                searchEnabled
                showDropDownButton
                showClearButton
                placeholder="Search product…"
                disabled={formDisabled}
              />
              <NumberBox
                width={100}
                value={line.quantity}
                min={0.0001}
                format="#,##0.####"
                showSpinButtons
                readOnly={formDisabled}
                onValueChanged={(e) =>
                  updateLine(index, { quantity: typeof e.value === "number" ? e.value : 1 })
                }
              />
              <NumberBox
                width={100}
                value={line.unitPrice}
                min={0}
                format="#,##0.00"
                showSpinButtons
                readOnly={formDisabled}
                onValueChanged={(e) =>
                  updateLine(index, {
                    unitPrice: typeof e.value === "number" ? e.value : 0,
                  })
                }
              />
              <span style={{ fontSize: 12, minWidth: 72 }}>
                = {(line.quantity * (line.unitPrice || 0)).toFixed(2)}
              </span>
              <Button
                icon="remove"
                stylingMode="text"
                onClick={() => removeLine(index)}
                disabled={formDisabled || lines.length <= 1}
              />
            </div>
          ))}
          <Button
            text="Add line"
            icon="add"
            stylingMode="outlined"
            onClick={addLine}
            disabled={formDisabled}
          />
        </div>
        <div style={{ padding: "10px 0 0", textAlign: "right" }}>
          <Button text="Cancel" stylingMode="outlined" onClick={closePopup} />
          <Button
            text={isEdit ? "Save changes" : "Save"}
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
