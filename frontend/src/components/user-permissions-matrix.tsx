import { useCallback, useEffect, useMemo, useState } from "react";
import ArrayStore from "devextreme/data/array_store";
import DataSource from "devextreme/data/data_source";
import DataGrid, {
  Column,
  Editing,
  Paging,
} from "devextreme-react/data-grid";
import Popup from "devextreme-react/popup";
import Button from "devextreme-react/button";
import notify from "devextreme/ui/notify";
import { apiFetch } from "../api/client";
import { PERMISSION_RESOURCES } from "../lib/permissions";
import { getErrorMessage } from "../utils/error-message";

type PermissionRow = {
  resource: string;
  label: string;
  canView: boolean;
  canRead: boolean;
  canAdd: boolean;
  canEdit: boolean;
  canDelete: boolean;
};

type UserPermissionsMatrixProps = {
  userId: string;
  userLabel: string;
  open: boolean;
  onClose: () => void;
};

export function UserPermissionsMatrix({
  userId,
  userLabel,
  open,
  onClose,
}: UserPermissionsMatrixProps) {
  const [rows, setRows] = useState<PermissionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = (await apiFetch(`/api/users/${userId}/permissions`)) as {
        permissions: PermissionRow[];
      };
      const byResource = new Map(data.permissions.map((p) => [p.resource, p]));
      setRows(
        PERMISSION_RESOURCES.map((r) => {
          const row = byResource.get(r.key);
          return {
            resource: r.key,
            label: r.label,
            canView: row?.canView ?? false,
            canRead: row?.canRead ?? false,
            canAdd: row?.canAdd ?? false,
            canEdit: row?.canEdit ?? false,
            canDelete: row?.canDelete ?? false,
          };
        }),
      );
    } catch (e: unknown) {
      notify(getErrorMessage(e, "Failed to load permissions"), "error", 5000);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (open && userId) {
      void load();
    }
  }, [open, userId, load]);

  const dataSource = useMemo(() => {
    const store = new ArrayStore({ key: "resource", data: rows });
    return new DataSource({ store });
  }, [rows]);

  const save = async () => {
    setSaving(true);
    try {
      await apiFetch(`/api/users/${userId}/permissions`, {
        method: "PUT",
        body: JSON.stringify({
          permissions: rows.map(
            ({ resource, canView, canRead, canAdd, canEdit, canDelete }) => ({
              resource,
              canView,
              canRead,
              canAdd,
              canEdit,
              canDelete,
            }),
          ),
        }),
      });
      notify("Permissions saved", "success", 2500);
      onClose();
    } catch (e: unknown) {
      notify(getErrorMessage(e, "Failed to save permissions"), "error", 5000);
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return null;
  }

  return (
    <Popup
      visible
      onHiding={onClose}
      title={`Permissions — ${userLabel}`}
      showTitle
      width={720}
      height="auto"
      maxHeight="90vh"
    >
      <div className="content-block" style={{ padding: "0 0 12px" }}>
        <p className="dx-field-item-help-text">
          Add, edit, and delete automatically require read and view. Read requires view.
        </p>
        <DataGrid
          className="dx-datagrid-app"
          dataSource={dataSource}
          keyExpr="resource"
          showBorders
          height={420}
          disabled={loading}
          onRowUpdated={(e) => {
            const updated = e.data as PermissionRow;
            setRows((prev) =>
              prev.map((r) => (r.resource === updated.resource ? { ...updated } : r)),
            );
          }}
        >
          <Editing mode="cell" allowUpdating />
          <Paging enabled={false} />
          <Column dataField="label" caption="Page" allowEditing={false} width={140} />
          <Column dataField="canView" caption="View" dataType="boolean" />
          <Column dataField="canRead" caption="Read" dataType="boolean" />
          <Column dataField="canAdd" caption="Add" dataType="boolean" />
          <Column dataField="canEdit" caption="Edit" dataType="boolean" />
          <Column dataField="canDelete" caption="Delete" dataType="boolean" />
        </DataGrid>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
          <Button text="Cancel" stylingMode="outlined" onClick={onClose} />
          <Button
            text="Save"
            type="default"
            stylingMode="contained"
            disabled={loading || saving}
            onClick={() => void save()}
          />
        </div>
      </div>
    </Popup>
  );
}
