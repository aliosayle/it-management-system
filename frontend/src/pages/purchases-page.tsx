import { useCallback, useEffect, useMemo, useState } from "react";
import CustomStore from "devextreme/data/custom_store";
import {
  Column,
  Paging,
  Pager,
  FilterRow,
  ColumnButton,
} from "devextreme-react/data-grid";
import Button from "devextreme-react/button";
import Popup from "devextreme-react/popup";
import SelectBox from "devextreme-react/select-box";
import TextArea from "devextreme-react/text-area";
import NumberBox from "devextreme-react/number-box";
import notify from "devextreme/ui/notify";
import { AppDataGrid } from "../components/app-data-grid";
import { apiFetch, apiFetchBlob } from "../api/client";

type PersonnelRow = {
  id: string;
  fullName: string;
  siteLabel: string;
};

type ProductRow = { id: string; sku: string; name: string };

type PurchaseListRow = {
  id: string;
  destination: string;
  bonOriginalName: string;
  notes: string | null;
  createdAt: string;
  authorizedByName: string;
  targetPersonnelName: string | null;
  createdByName: string;
  lineCount: number;
};

type PurchaseDetailLine = {
  id: string;
  productId: string;
  sku: string;
  productName: string;
  quantity: number;
  lineIndex: number;
};

type PurchaseDetail = {
  id: string;
  destination: "STOCK" | "PERSONNEL_BIN";
  bonOriginalName: string;
  notes: string | null;
  authorizedBy: { id: string; firstName: string; lastName: string };
  targetPersonnel: { id: string; firstName: string; lastName: string } | null;
  lines: PurchaseDetailLine[];
};

type LineDraft = { productId: string | null; quantity: number };

const DEST_OPTIONS = [
  { value: "STOCK", text: "Receive to stock (warehouse)" },
  { value: "PERSONNEL_BIN", text: "Direct to personal bin (no warehouse stock)" },
];

export default function PurchasesPage() {
  const [popupOpen, setPopupOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [personnel, setPersonnel] = useState<PersonnelRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [authorizerId, setAuthorizerId] = useState<string | null>(null);
  const [destination, setDestination] = useState<"STOCK" | "PERSONNEL_BIN">("STOCK");
  const [targetPersonnelId, setTargetPersonnelId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([{ productId: null, quantity: 1 }]);
  const [bonFile, setBonFile] = useState<File | null>(null);
  const [existingBonName, setExistingBonName] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [gridRefresh, setGridRefresh] = useState(0);

  const isEdit = editingId !== null;

  const loadMeta = useCallback(async () => {
    const [pl, pr] = await Promise.all([
      apiFetch("/api/personnel") as Promise<PersonnelRow[]>,
      apiFetch("/api/products") as Promise<ProductRow[]>,
    ]);
    setPersonnel(pl);
    setProducts(pr);
    setAuthorizerId((prev) => prev ?? pl[0]?.id ?? null);
  }, []);

  useEffect(() => {
    loadMeta().catch((e: unknown) => {
      notify(e instanceof Error ? e.message : "Failed to load options", "error", 4000);
    });
  }, [loadMeta]);

  const personnelOptions = useMemo(
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
    setAuthorizerId(personnel[0]?.id ?? null);
    setDestination("STOCK");
    setTargetPersonnelId(null);
    setNotes("");
    setLines([{ productId: products[0]?.id ?? null, quantity: 1 }]);
    setBonFile(null);
    setExistingBonName(null);
    setEditingId(null);
  }, [personnel, products]);

  const openCreate = useCallback(() => {
    resetForm();
    setPopupOpen(true);
  }, [resetForm]);

  const applyDetailToForm = useCallback((d: PurchaseDetail) => {
    setEditingId(d.id);
    setAuthorizerId(d.authorizedBy.id);
    setDestination(d.destination);
    setTargetPersonnelId(d.targetPersonnel?.id ?? null);
    setNotes(d.notes ?? "");
    setLines(
      d.lines.length > 0
        ? d.lines.map((l) => ({ productId: l.productId, quantity: l.quantity }))
        : [{ productId: products[0]?.id ?? null, quantity: 1 }],
    );
    setBonFile(null);
    setExistingBonName(d.bonOriginalName);
  }, [products]);

  const openEdit = useCallback(
    async (row: PurchaseListRow) => {
      try {
        const d = (await apiFetch(`/api/purchases/${row.id}`)) as PurchaseDetail;
        applyDetailToForm(d);
        setPopupOpen(true);
      } catch (e: unknown) {
        notify(e instanceof Error ? e.message : "Failed to load purchase", "error", 4000);
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
    setLines((prev) => [...prev, { productId: products[0]?.id ?? null, quantity: 1 }]);
  }, [products]);

  const removeLine = useCallback((index: number) => {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }, []);

  const updateLine = useCallback((index: number, patch: Partial<LineDraft>) => {
    setLines((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }, []);

  const submitPurchase = useCallback(async () => {
    if (!authorizerId) {
      notify("Select who authorized the purchase", "warning", 2500);
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
      .map((l) => ({ productId: l.productId as string, quantity: l.quantity }));
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
        fd.append("destination", destination);
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
      notify(e instanceof Error ? e.message : "Failed to save", "error", 4000);
    } finally {
      setSubmitting(false);
    }
  }, [
    authorizerId,
    destination,
    targetPersonnelId,
    notes,
    lines,
    bonFile,
    isEdit,
    editingId,
    closePopup,
    resetForm,
  ]);

  const deletePurchase = useCallback(
    async (row: PurchaseListRow) => {
      const ok = window.confirm(
        "Delete this purchase? Warehouse stock or personal bin quantities will be reversed.",
      );
      if (!ok) return;
      try {
        await apiFetch(`/api/purchases/${row.id}`, { method: "DELETE" });
        notify("Purchase deleted", "success", 2000);
        setGridRefresh((k) => k + 1);
      } catch (e: unknown) {
        notify(e instanceof Error ? e.message : "Delete failed", "error", 4000);
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
      notify(e instanceof Error ? e.message : "Download failed", "error", 4000);
    }
  }, []);

  return (
    <div className="content-block content-block--fill">
      <div className="stock-toolbar">
        <h2 style={{ margin: 0, marginRight: 8 }}>Purchases</h2>
        <Button
          text="Record purchase"
          type="default"
          stylingMode="contained"
          icon="add"
          onClick={openCreate}
        />
      </div>

      <div className="page-grid-body">
        <AppDataGrid
          key={gridRefresh}
          persistenceKey="itm-grid-purchases"
          dataSource={dataSource}
          repaintChangesOnly
          height="100%"
          onDataErrorOccurred={(e) => {
            notify((e.error as Error)?.message || "Request failed", "error", 4000);
          }}
        >
          <FilterRow visible />
          <Column dataField="createdAt" dataType="datetime" caption="When" width={138} />
          <Column
            dataField="destination"
            caption="Dest"
            width={88}
            calculateCellValue={(row: PurchaseListRow) =>
              row.destination === "STOCK" ? "Stock" : "Bin"
            }
          />
          <Column dataField="authorizedByName" caption="Authorized by" />
          <Column dataField="targetPersonnelName" caption="Bin recipient" />
          <Column dataField="lineCount" caption="#" width={44} dataType="number" />
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
        width={560}
        height="auto"
        showCloseButton
      >
        <div className="dx-fieldset" style={{ paddingTop: 8 }}>
          <div className="dx-field">
            <span className="dx-field-label">Authorized by (personnel)</span>
            <SelectBox
              dataSource={personnelOptions}
              displayExpr="label"
              valueExpr="id"
              value={authorizerId}
              onValueChanged={(e) => setAuthorizerId(e.value ?? null)}
              searchEnabled
              showDropDownButton
              placeholder="Search personnel…"
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
                setDestination((e.value as "STOCK" | "PERSONNEL_BIN") ?? "STOCK")
              }
              searchEnabled
              disabled={isEdit}
            />
          </div>
          {destination === "PERSONNEL_BIN" ? (
            <div className="dx-field">
              <span className="dx-field-label">Personal bin for</span>
              <SelectBox
                dataSource={personnelOptions}
                displayExpr="label"
                valueExpr="id"
                value={targetPersonnelId}
                onValueChanged={(e) => setTargetPersonnelId(e.value ?? null)}
                searchEnabled
                showDropDownButton
                placeholder="Search personnel…"
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
              onChange={(ev) => setBonFile(ev.target.files?.[0] ?? null)}
            />
          </div>
          <div className="dx-field">
            <span className="dx-field-label">Notes</span>
            <TextArea value={notes} onValueChanged={(e) => setNotes(e.value ?? "")} height={56} />
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
                width={280}
                dataSource={productOptions}
                displayExpr="label"
                valueExpr="id"
                value={line.productId}
                onValueChanged={(e) => updateLine(index, { productId: e.value ?? null })}
                searchEnabled
                showDropDownButton
                placeholder="Search product…"
              />
              <NumberBox
                width={120}
                value={line.quantity}
                min={0.0001}
                format="#,##0.####"
                showSpinButtons
                onValueChanged={(e) =>
                  updateLine(index, { quantity: typeof e.value === "number" ? e.value : 1 })
                }
              />
              <Button
                icon="remove"
                stylingMode="text"
                onClick={() => removeLine(index)}
                disabled={lines.length <= 1}
              />
            </div>
          ))}
          <Button text="Add line" icon="add" stylingMode="outlined" onClick={addLine} />
        </div>
        <div style={{ padding: "10px 0 0", textAlign: "right" }}>
          <Button text="Cancel" stylingMode="outlined" onClick={closePopup} />
          <Button
            text={isEdit ? "Save changes" : "Save"}
            type="default"
            stylingMode="contained"
            disabled={submitting}
            onClick={() => void submitPurchase()}
          />
        </div>
      </Popup>
    </div>
  );
}
