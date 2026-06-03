import { exportDataGrid } from "devextreme/excel_exporter";
import { Workbook } from "devextreme-exceljs-fork";
import saveAs from "file-saver";
import type { ExportingEvent } from "devextreme/ui/data_grid";

/** DevExtreme ExcelJS fork + CSP: see Security Considerations in DevExtreme docs. */
if (typeof window !== "undefined") {
  (window as Window & { regeneratorRuntime?: null }).regeneratorRuntime = null;
}

/** Derive a friendly download name from `itm-grid-products-v2` → `products`. */
export function gridExportFileName(persistenceKey?: string): string {
  if (!persistenceKey) {
    return "export";
  }
  const base = persistenceKey.replace(/^itm-grid-/, "").replace(/-v\d+$/, "");
  return base || "export";
}

function resolveXlsxFileName(e: ExportingEvent, defaultBase: string): string {
  const raw = e.fileName?.trim();
  if (raw) {
    return raw.toLowerCase().endsWith(".xlsx") ? raw : `${raw}.xlsx`;
  }
  const base = defaultBase.replace(/\.xlsx$/i, "");
  return `${base}.xlsx`;
}

/**
 * Excel export for DataGrid toolbar (DevExtreme requires exceljs fork + file-saver + this handler).
 * Call from `onExporting` and set `e.cancel = true` so the built-in (non-functional) path is skipped.
 */
export async function exportDataGridToExcel(
  e: ExportingEvent,
  defaultFileName = "export",
): Promise<void> {
  e.cancel = true;

  const workbook = new Workbook();
  const worksheet = workbook.addWorksheet("Data");

  await exportDataGrid({
    component: e.component,
    worksheet,
    selectedRowsOnly: e.selectedRowsOnly,
  });

  const buffer = await workbook.xlsx.writeBuffer();
  saveAs(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    resolveXlsxFileName(e, defaultFileName),
  );
}
