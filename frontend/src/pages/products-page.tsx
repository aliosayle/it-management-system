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
  Item as GridToolbarItem,
  type DataGridRef,
} from "devextreme-react/data-grid";
import Button from "devextreme-react/button";
import PopupDx from "devextreme-react/popup";
import Form, { Item, Label, RequiredRule as FormRequiredRule } from "devextreme-react/form";
import type { FormTypes } from "devextreme-react/form";
import notify from "devextreme/ui/notify";
import { AppDataGrid } from "../components/app-data-grid";
import { apiFetch } from "../api/client";
import { getDataGridErrorMessage, getErrorMessage } from "../utils/error-message";
import type { ProductOption } from "../components/personnel-bin-popup";

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

export default function ProductsPage() {
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

  return (
    <div className="content-block content-block--fill">
      <div className="page-toolbar">
        <h2>Products</h2>
      </div>

      <div className="page-grid-body">
        <AppDataGrid
        ref={gridRef}
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
        <Column
          dataField="id"
          visible={false}
          allowEditing={false}
          formItem={{ visible: false }}
        />
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
    </div>
  );
}
