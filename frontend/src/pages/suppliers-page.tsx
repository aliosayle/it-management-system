import { useCallback, useMemo, useState } from "react";
import CustomStore from "devextreme/data/custom_store";
import {
  Column,
  Paging,
  Pager,
  FilterRow,
  Editing,
  Popup,
  RequiredRule,
  ColumnButton,
} from "devextreme-react/data-grid";
import PopupDx from "devextreme-react/popup";
import notify from "devextreme/ui/notify";
import { AppDataGrid } from "../components/app-data-grid";
import { apiFetch } from "../api/client";
import { getDataGridErrorMessage } from "../utils/error-message";

type SupplierPurchaseLine = {
  productId: string;
  sku: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  lineDestination: string;
  lineBinRecipientName: string | null;
};

type SupplierPurchaseRow = {
  id: string;
  status: string;
  destination: string;
  createdAt: string;
  bonOriginalName: string;
  notes: string | null;
  authorizedByName: string;
  buyerName: string;
  recordedByName: string;
  totalAmount: number;
  lines: SupplierPurchaseLine[];
};

export default function SuppliersPage() {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historySupplierId, setHistorySupplierId] = useState<string | null>(null);
  const [historySupplierName, setHistorySupplierName] = useState("");

  const dataSource = useMemo(
    () =>
      new CustomStore({
        key: "id",
        load: () => apiFetch("/api/suppliers") as Promise<Record<string, unknown>[]>,
        insert: (values) =>
          apiFetch("/api/suppliers", {
            method: "POST",
            body: JSON.stringify(values),
          }) as Promise<Record<string, unknown>>,
        update: (key, values) => {
          const payload = { ...(values as Record<string, unknown>) };
          delete payload.id;
          return apiFetch(`/api/suppliers/${key}`, {
            method: "PATCH",
            body: JSON.stringify(payload),
          }) as Promise<Record<string, unknown>>;
        },
        remove: (key) =>
          apiFetch(`/api/suppliers/${key}`, { method: "DELETE" }) as Promise<void>,
      }),
    [],
  );

  const historyStore = useMemo(() => {
    const sid = historySupplierId;
    if (!sid) {
      return new CustomStore({
        key: "id",
        load: () => Promise.resolve({ data: [], totalCount: 0 }),
      });
    }
    return new CustomStore({
      key: "id",
      load: async () => {
        const rows = (await apiFetch(
          `/api/suppliers/${sid}/purchases`,
        )) as SupplierPurchaseRow[];
        const flat: Record<string, unknown>[] = [];
        for (const p of rows) {
          for (const line of p.lines) {
            flat.push({
              id: `${p.id}-${line.productId}-${line.sku}`,
              purchaseId: p.id,
              purchaseStatus: p.status,
              destination: p.destination,
              lineDestination: line.lineDestination,
              lineBinRecipientName: line.lineBinRecipientName,
              createdAt: p.createdAt,
              bonOriginalName: p.bonOriginalName,
              supplierTotal: p.totalAmount,
              sku: line.sku,
              productName: line.productName,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              lineTotal: line.lineTotal,
              authorizedByName: p.authorizedByName,
              buyerName: p.buyerName,
              recordedByName: p.recordedByName,
            });
          }
        }
        return { data: flat, totalCount: flat.length };
      },
    });
  }, [historySupplierId]);

  const openHistory = useCallback((row: Record<string, unknown>) => {
    const id = String(row.id ?? "");
    const name = String(row.name ?? "");
    if (!id) return;
    setHistorySupplierId(id);
    setHistorySupplierName(name);
    setHistoryOpen(true);
  }, []);

  return (
    <div className="content-block content-block--fill">
      <div className="page-toolbar">
        <h2>Suppliers</h2>
      </div>
      <div className="page-grid-body">
        <AppDataGrid
          persistenceKey="itm-grid-suppliers"
          dataSource={dataSource}
          repaintChangesOnly
          height="100%"
          onDataErrorOccurred={(e) => {
            notify(getDataGridErrorMessage(e), "error", 5000);
          }}
        >
          <Editing allowAdding allowUpdating allowDeleting mode="popup" useIcons>
            <Popup title="Supplier" showTitle width={520} height="auto" />
          </Editing>
          <FilterRow visible />
          <Column dataField="id" visible={false} allowEditing={false} formItem={{ visible: false }} />
          <Column dataField="name" minWidth={200}>
            <RequiredRule />
          </Column>
          <Column dataField="email" width={200} />
          <Column dataField="phone" width={140} />
          <Column dataField="notes" formItem={{ colSpan: 2 }} />
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
            <ColumnButton name="edit" />
            <ColumnButton
              hint="Purchase history"
              icon="orderedlist"
              text="History"
              onClick={(e) => {
                const row = e.row?.data as Record<string, unknown> | undefined;
                if (row) openHistory(row);
              }}
            />
            <ColumnButton name="delete" />
          </Column>
          <Paging defaultPageSize={20} />
          <Pager showPageSizeSelector showInfo />
        </AppDataGrid>
      </div>

      <PopupDx
        visible={historyOpen}
        onHiding={() => {
          setHistoryOpen(false);
          setHistorySupplierId(null);
          setHistorySupplierName("");
        }}
        showTitle
        title={
          historySupplierName
            ? `Purchases from ${historySupplierName}`
            : "Purchase history"
        }
        width={1000}
        height={560}
        showCloseButton
      >
        <div style={{ height: "100%", minHeight: 420, display: "flex", flexDirection: "column" }}>
          <AppDataGrid
            key={historySupplierId ?? "none"}
            keyExpr="id"
            persistenceKey={`itm-supplier-purchase-lines-${historySupplierId ?? "x"}`}
            dataSource={historyStore}
            height="100%"
            showAddRowButton={false}
            onDataErrorOccurred={(e) => {
              notify(getDataGridErrorMessage(e), "error", 5000);
            }}
          >
            <FilterRow visible />
            <Column dataField="createdAt" dataType="datetime" caption="When" width={138} />
            <Column dataField="purchaseStatus" caption="Status" width={90} />
            <Column
              dataField="lineDestination"
              caption="Line dest"
              width={84}
              calculateCellValue={(r: Record<string, unknown>) => {
                const d = String(r.lineDestination ?? r.destination ?? "");
                if (d === "STOCK") return "Stock";
                if (d === "PERSONNEL_BIN") return "Bin";
                if (d === "SITE_BIN") return "Site";
                if (d === "DEPARTMENT") return "Dept";
                if (d === "MIXED") return "Mixed";
                return d || "—";
              }}
            />
            <Column dataField="lineBinRecipientName" caption="Bin assignee" width={120} />
            <Column dataField="sku" width={120} />
            <Column dataField="productName" caption="Product" />
            <Column dataField="quantity" dataType="number" width={88} />
            <Column dataField="unitPrice" caption="Unit price" dataType="number" format="#,##0.00" />
            <Column dataField="lineTotal" caption="Line total" dataType="number" format="#,##0.00" />
            <Column dataField="authorizedByName" caption="Authorized by" width={120} />
            <Column dataField="buyerName" caption="Buyer" width={120} />
            <Column dataField="bonOriginalName" caption="Bon" width={120} />
            <Paging defaultPageSize={25} />
            <Pager showPageSizeSelector showInfo />
          </AppDataGrid>
        </div>
      </PopupDx>
    </div>
  );
}
