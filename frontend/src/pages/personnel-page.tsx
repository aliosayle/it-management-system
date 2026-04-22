import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CustomStore from "devextreme/data/custom_store";
import {
  Column,
  Paging,
  Pager,
  FilterRow,
  Editing,
  Popup,
  RequiredRule,
  EmailRule,
  ColumnButton,
  type DataGridRef,
} from "devextreme-react/data-grid";
import Button from "devextreme-react/button";
import PopupDx from "devextreme-react/popup";
import Form, { Item, Label } from "devextreme-react/form";
import type { FormTypes } from "devextreme-react/form";
import notify from "devextreme/ui/notify";
import { AppDataGrid } from "../components/app-data-grid";
import {
  PersonnelBinPopup,
  type ProductOption,
} from "../components/personnel-bin-popup";
import { apiFetch } from "../api/client";
import { getDataGridErrorMessage, getErrorMessage } from "../utils/error-message";

type FormMeta = {
  sites: { id: string; label: string }[];
  users: { id: string; email: string; displayName: string }[];
};

type PersonnelDetailForm = {
  userId: string | null;
  canAuthorizePurchases: boolean;
  createdAt: string;
  updatedAt: string;
};

/** Strip read-only / grid-only fields and extras managed in the Details popup. */
function toPersonnelGridSavePayload(row: Record<string, unknown>): Record<string, unknown> {
  const p = { ...row };
  delete p.fullName;
  delete p.siteLabel;
  delete p.userEmail;
  delete p.userId;
  delete p.canAuthorizePurchases;
  delete p.createdAt;
  delete p.updatedAt;
  if (typeof p.email === "string" && p.email.trim() === "") {
    p.email = null;
  }
  if (typeof p.phone === "string" && p.phone.trim() === "") {
    p.phone = null;
  }
  return p;
}

function formatDetailDate(value: string | null | undefined): string {
  if (value == null || value === "") {
    return "—";
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString();
}

export default function PersonnelPage() {
  const gridRef = useRef<DataGridRef>(null);
  const [meta, setMeta] = useState<FormMeta | null>(null);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [binOpen, setBinOpen] = useState(false);
  const [binPersonnelId, setBinPersonnelId] = useState<string | null>(null);
  const [binTitle, setBinTitle] = useState("");

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailPersonnelId, setDetailPersonnelId] = useState<string | null>(null);
  const [detailTitle, setDetailTitle] = useState("");
  const [detailForm, setDetailForm] = useState<PersonnelDetailForm>({
    userId: null,
    canAuthorizePurchases: false,
    createdAt: "",
    updatedAt: "",
  });
  const [detailSaving, setDetailSaving] = useState(false);

  const loadFormMeta = useCallback(async (personnelId?: string) => {
    const qs =
      personnelId && personnelId.length > 0
        ? `?personnelId=${encodeURIComponent(personnelId)}`
        : "";
    const m = (await apiFetch(`/api/personnel/form-meta${qs}`)) as FormMeta;
    setMeta(m);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await loadFormMeta();
        const plist = (await apiFetch("/api/products")) as {
          id: string;
          sku: string;
          name: string;
        }[];
        setProducts(
          plist.map((p) => ({
            id: p.id,
            sku: p.sku,
            name: p.name,
            label: `${p.sku} — ${p.name}`,
          })),
        );
      } catch (e: unknown) {
        notify(getErrorMessage(e, "Failed to load options"), "error", 5000);
      }
    })();
  }, [loadFormMeta]);

  const userLookupRows = useMemo(
    () =>
      (meta?.users ?? []).map((u) => ({
        ...u,
        label: `${u.displayName} (${u.email})`,
      })),
    [meta],
  );

  const dataSource = useMemo(
    () =>
      new CustomStore({
        key: "id",
        load: () => apiFetch("/api/personnel") as Promise<Record<string, unknown>[]>,
        insert: (values) =>
          apiFetch("/api/personnel", {
            method: "POST",
            body: JSON.stringify(toPersonnelGridSavePayload(values as Record<string, unknown>)),
          }) as Promise<Record<string, unknown>>,
        update: (key, values) => {
          const payload = toPersonnelGridSavePayload(values as Record<string, unknown>);
          delete payload.id;
          return apiFetch(`/api/personnel/${key}`, {
            method: "PATCH",
            body: JSON.stringify(payload),
          }) as Promise<Record<string, unknown>>;
        },
        remove: (key) =>
          apiFetch(`/api/personnel/${key}`, { method: "DELETE" }) as Promise<void>,
      }),
    [],
  );

  const openBin = useCallback((row: Record<string, unknown>) => {
    const id = row.id as string;
    const name = (row.fullName as string) || `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim();
    setBinPersonnelId(id);
    setBinTitle(name || id);
    setBinOpen(true);
  }, []);

  const openPersonnelDetails = useCallback(
    async (id: string, titleHint: string) => {
      try {
        const row = (await apiFetch(`/api/personnel/${id}`)) as {
          userId: string | null;
          canAuthorizePurchases: boolean;
          createdAt: string;
          updatedAt: string;
        };
        setDetailPersonnelId(id);
        setDetailTitle(titleHint);
        setDetailForm({
          userId: row.userId ?? null,
          canAuthorizePurchases: Boolean(row.canAuthorizePurchases),
          createdAt: row.createdAt ?? "",
          updatedAt: row.updatedAt ?? "",
        });
        await loadFormMeta(id);
        setDetailOpen(true);
      } catch (e: unknown) {
        notify(getErrorMessage(e, "Failed to load personnel details"), "error", 5000);
      }
    },
    [loadFormMeta],
  );

  const onDetailFieldChanged = useCallback((e: FormTypes.FieldDataChangedEvent) => {
    const { dataField, value } = e;
    if (!dataField) return;
    setDetailForm((prev) => ({ ...prev, [dataField]: value }));
  }, []);

  const savePersonnelDetails = useCallback(async () => {
    if (!detailPersonnelId) return;
    setDetailSaving(true);
    try {
      await apiFetch(`/api/personnel/${detailPersonnelId}`, {
        method: "PATCH",
        body: JSON.stringify({
          userId: detailForm.userId,
          canAuthorizePurchases: detailForm.canAuthorizePurchases,
        }),
      });
      notify("Details saved", "success", 2000);
      setDetailOpen(false);
      setDetailPersonnelId(null);
      gridRef.current?.instance().refresh();
    } catch (e: unknown) {
      notify(getErrorMessage(e, "Failed to save details"), "error", 5000);
    } finally {
      setDetailSaving(false);
    }
  }, [detailPersonnelId, detailForm.userId, detailForm.canAuthorizePurchases]);

  return (
    <div className="content-block content-block--fill">
      <div className="page-toolbar">
        <h2>Personnel</h2>
      </div>
      <div className="page-grid-body">
        <AppDataGrid
          ref={gridRef}
          persistenceKey="itm-grid-personnel-v2"
          dataSource={dataSource}
          repaintChangesOnly
          height="100%"
          onEditingStart={(e) => {
            const id = (e.data as { id?: string })?.id;
            loadFormMeta(id).catch((err: unknown) => {
              notify(getErrorMessage(err, "Failed to load form options"), "error", 5000);
            });
          }}
          onInitNewRow={() => {
            loadFormMeta().catch((err: unknown) => {
              notify(getErrorMessage(err, "Failed to load form options"), "error", 5000);
            });
          }}
          onDataErrorOccurred={(e) => {
            notify(getDataGridErrorMessage(e), "error", 5000);
          }}
        >
          <Editing allowAdding allowUpdating allowDeleting mode="popup" useIcons>
            <Popup title="Personnel" showTitle width={560} height="auto" />
          </Editing>
          <FilterRow visible />
          <Column
            dataField="id"
            visible={false}
            allowEditing={false}
            formItem={{ visible: false }}
          />
          <Column dataField="firstName" width={130}>
            <RequiredRule />
          </Column>
          <Column dataField="lastName" width={130}>
            <RequiredRule />
          </Column>
          <Column
            dataField="fullName"
            caption="Full name"
            allowEditing={false}
            formItem={{ visible: false }}
          />
          <Column dataField="email" width={220}>
            <EmailRule ignoreEmptyValue />
          </Column>
          <Column dataField="phone" />
          <Column
            dataField="siteId"
            caption="Site"
            width={240}
            lookup={{
              dataSource: meta?.sites ?? [],
              valueExpr: "id",
              displayExpr: "label",
              allowSearch: true,
              allowClearing: true,
            }}
          >
            <RequiredRule />
          </Column>
          <Column type="buttons" width={200}>
            <ColumnButton name="edit" />
            <ColumnButton name="delete" />
            <ColumnButton
              hint="Account, authorizer flag, and timestamps"
              icon="preferences"
              text="Details"
              onClick={(e) => {
                const row = e.row?.data as Record<string, unknown> | undefined;
                const id = row?.id as string | undefined;
                if (!row || !id || e.row?.isNewRow) {
                  notify("Save the personnel record first", "warning", 2500);
                  return;
                }
                const title =
                  (row.fullName as string) ||
                  `${String(row.firstName ?? "")} ${String(row.lastName ?? "")}`.trim() ||
                  id;
                void openPersonnelDetails(id, title);
              }}
            />
            <ColumnButton
              hint="View personal bin"
              icon="box"
              text="Bin"
              onClick={(ev) => {
                const row = ev.row?.data as Record<string, unknown> | undefined;
                if (row) {
                  openBin(row);
                }
              }}
            />
          </Column>
          <Paging defaultPageSize={20} />
          <Pager showPageSizeSelector showInfo />
        </AppDataGrid>
      </div>

      <PopupDx
        visible={detailOpen}
        onHiding={() => {
          setDetailOpen(false);
          setDetailPersonnelId(null);
        }}
        showTitle
        title={`Personnel details — ${detailTitle}`}
        width={480}
        height="auto"
        showCloseButton
      >
        <Form formData={detailForm} onFieldDataChanged={onDetailFieldChanged}>
          <Item
            dataField="userId"
            editorType="dxSelectBox"
            editorOptions={{
              dataSource: userLookupRows,
              displayExpr: "label",
              valueExpr: "id",
              searchEnabled: true,
              showDropDownButton: true,
              showClearButton: true,
              placeholder: "No linked user",
            }}
          >
            <Label text="Linked app user" />
          </Item>
          <Item
            dataField="canAuthorizePurchases"
            editorType="dxCheckBox"
            editorOptions={{ text: "Can authorize purchases" }}
          >
            <Label visible={false} />
          </Item>
        </Form>
        <div
          className="personnel-detail-meta"
          style={{
            marginTop: 10,
            fontSize: 13,
            color: "var(--base-text-color-alpha-7, rgba(0,0,0,0.65))",
            lineHeight: 1.5,
          }}
        >
          <div>
            <strong>Created</strong> {formatDetailDate(detailForm.createdAt)}
          </div>
          <div>
            <strong>Updated</strong> {formatDetailDate(detailForm.updatedAt)}
          </div>
        </div>
        <div style={{ padding: "12px 0 0", textAlign: "right", display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Button
            text="Cancel"
            stylingMode="outlined"
            disabled={detailSaving}
            onClick={() => {
              setDetailOpen(false);
              setDetailPersonnelId(null);
            }}
          />
          <Button
            text="Save details"
            type="default"
            stylingMode="contained"
            disabled={detailSaving}
            onClick={() => void savePersonnelDetails()}
          />
        </div>
      </PopupDx>

      <PersonnelBinPopup
        visible={binOpen}
        personnelId={binPersonnelId}
        title={binTitle}
        products={products}
        onClose={() => {
          setBinOpen(false);
          setBinPersonnelId(null);
        }}
      />
    </div>
  );
}
