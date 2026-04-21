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

type LineDraft = { productId: string | null; quantity: number };

const DEST_OPTIONS = [
  { value: "STOCK", text: "Receive to stock (warehouse)" },
  { value: "PERSONNEL_BIN", text: "Direct to personal bin (no warehouse stock)" },
];

export default function PurchasesPage() {
  const [popupOpen, setPopupOpen] = useState(false);
  const [personnel, setPersonnel] = useState<PersonnelRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [authorizerId, setAuthorizerId] = useState<string | null>(null);
  const [destination, setDestination] = useState<"STOCK" | "PERSONNEL_BIN">("STOCK");
  const [targetPersonnelId, setTargetPersonnelId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([{ productId: null, quantity: 1 }]);
  const [bonFile, setBonFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [gridRefresh, setGridRefresh] = useState(0);

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
  }, [personnel, products]);

  const openPopup = useCallback(() => {
    resetForm();
    setPopupOpen(true);
  }, [resetForm]);

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
    if (!bonFile) {
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
    fd.append("bon", bonFile);

    setSubmitting(true);
    try {
      await apiFetch("/api/purchases", { method: "POST", body: fd });
      notify("Purchase recorded", "success", 2000);
      setPopupOpen(false);
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
  ]);

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
          onClick={openPopup}
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
          <Column dataField="createdAt" dataType="datetime" caption="When" />
          <Column
            dataField="destination"
            caption="Destination"
            width={200}
            calculateCellValue={(row: PurchaseListRow) =>
              row.destination === "STOCK" ? "Stock" : "Personal bin"
            }
          />
          <Column dataField="authorizedByName" caption="Authorized by" />
          <Column dataField="targetPersonnelName" caption="Bin recipient" />
          <Column dataField="lineCount" caption="Lines" width={80} dataType="number" />
          <Column dataField="createdByName" caption="Recorded by" />
          <Column dataField="bonOriginalName" caption="Bon" width={180} />
          <Column type="buttons" width={100}>
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
          </Column>
          <Paging defaultPageSize={20} />
          <Pager showPageSizeSelector showInfo />
        </AppDataGrid>
      </div>

      <Popup
        visible={popupOpen}
        onHiding={() => setPopupOpen(false)}
        showTitle
        title="Record purchase"
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
            <span className="dx-field-label">Bon (PDF or image)</span>
            <input
              type="file"
              accept=".pdf,image/*"
              onChange={(ev) => setBonFile(ev.target.files?.[0] ?? null)}
            />
          </div>
          <div className="dx-field">
            <span className="dx-field-label">Notes</span>
            <TextArea value={notes} onValueChanged={(e) => setNotes(e.value ?? "")} height={60} />
          </div>
          <div style={{ marginBottom: 8, fontWeight: 600 }}>Lines</div>
          {lines.map((line, index) => (
            <div
              key={index}
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                marginBottom: 8,
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
        <div style={{ padding: "12px 0 0", textAlign: "right" }}>
          <Button text="Cancel" stylingMode="outlined" onClick={() => setPopupOpen(false)} />
          <Button
            text="Save"
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
