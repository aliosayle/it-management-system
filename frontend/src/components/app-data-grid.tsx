import {
  forwardRef,
  useCallback,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";
import type { ToolbarPreparingEvent } from "devextreme/ui/data_grid";
import type { OptionChangedEvent } from "devextreme/ui/data_grid";
import type dxDataGrid from "devextreme/ui/data_grid";
import type { Field } from "devextreme/ui/filter_builder";
import { usePagePermissions } from "../hooks/use-permissions";
import type { PermissionResource } from "../lib/permissions";
import DataGrid, {
  type DataGridRef,
  Toolbar,
  Item as ToolbarItem,
  HeaderFilter,
  StateStoring,
} from "devextreme-react/data-grid";
import FilterBuilder from "devextreme-react/filter-builder";
import notify from "devextreme/ui/notify";
import type { ContentReadyEvent, ExportingEvent } from "devextreme/ui/data_grid";
import { getErrorMessage } from "../utils/error-message";
import {
  exportDataGridToExcel,
  gridExportFileName,
} from "../utils/devextreme-grid-excel-export";

const AUTO_NUMERIC_SUMMARY_PREFIX = "__appAutoSum:";

/** Avoids redundant summary.option() calls (can retrigger load panel / remote reshape). */
const lastAutoFooterSig = new WeakMap<object, string>();

function mergeGridSection<T extends Record<string, unknown>>(
  defaults: T,
  override: Partial<T> | undefined | null,
): T {
  if (!override || typeof override !== "object") {
    return defaults;
  }
  return { ...defaults, ...override };
}

function buildFilterFields(grid: dxDataGrid): Field[] {
  return grid
    .getVisibleColumns()
    .filter(
      (c) =>
        typeof c.dataField === "string" &&
        Boolean(c.dataField) &&
        c.allowFiltering !== false &&
        c.type !== "buttons" &&
        c.type !== "adaptive",
    )
    .map((c) => {
      const field: Field = {
        dataField: c.dataField as string,
        caption:
          typeof c.caption === "string" && c.caption
            ? c.caption
            : (c.dataField as string),
      };
      if (c.dataType) {
        field.dataType = c.dataType as Field["dataType"];
      }
      return field;
    });
}

export type AppDataGridProps = ComponentPropsWithoutRef<typeof DataGrid> & {
  /** When set, column order, widths (with resizing), filters, etc. persist in localStorage */
  persistenceKey?: string;
  /** Toolbar search box width (default 360) */
  searchPanelWidth?: number;
  searchPlaceholder?: string;
  /**
   * Show the grid "Add row" toolbar button (when editing allows adding).
   * Set false for read-only grids or when add is a custom action only.
   */
  showAddRowButton?: boolean;
  /** Extra toolbar items (e.g. custom buttons) rendered after Add, before search */
  toolbarItems?: ReactNode;
  /** Base name for Excel download (without extension). Defaults from `persistenceKey`. */
  exportFileName?: string;
  /**
   * When true (default), a footer total (sum) is added for each visible column with `dataType="number"`.
   * Custom `summary.totalItems` entries are preserved. Set false when you supply your own summary
   * or when totals are not meaningful (e.g. some remote reshape setups).
   */
  autoNumericFooter?: boolean;
  /** When set, toolbar add row stays visible but is disabled when the user lacks add permission. */
  permissionResource?: PermissionResource;
  /** DevExtreme Filter Builder panel below the grid (default true). */
  showFilterBuilder?: boolean;
};

function footerSignature(
  userTotals: Array<Record<string, unknown>>,
  numericColumns: Array<{ dataField: string; format: unknown }>,
): string {
  const userPart = userTotals
    .map(
      (t) =>
        `${String(t.column ?? "")}:${String(t.summaryType ?? "")}:${String(t.name ?? "")}`,
    )
    .sort()
    .join("|");
  const numPart = [...numericColumns]
    .map((c) => `${c.dataField}:${JSON.stringify(c.format ?? null)}`)
    .sort()
    .join(",");
  return `${numPart}#${userPart}`;
}

function applyAutoNumericSummaries(component: dxDataGrid): void {
  const summaryOption = component.option("summary") as
    | {
        totalItems?: Array<Record<string, unknown>>;
        recalculateWhileEditing?: boolean;
        [key: string]: unknown;
      }
    | undefined;

  const existingTotals = summaryOption?.totalItems ?? [];
  const userTotals = existingTotals.filter(
    (t) =>
      typeof t.name !== "string" || !String(t.name).startsWith(AUTO_NUMERIC_SUMMARY_PREFIX),
  );

  const cols = component.getVisibleColumns();
  const numericFields = cols.filter(
    (c) =>
      typeof c.dataField === "string" &&
      Boolean(c.dataField) &&
      c.dataType === "number" &&
      c.visible !== false &&
      c.type !== "buttons" &&
      c.type !== "adaptive",
  );

  const numericMeta = numericFields.map((c) => ({
    dataField: c.dataField as string,
    format: c.format,
  }));

  const sig = footerSignature(userTotals, numericMeta);
  if (lastAutoFooterSig.get(component) === sig) {
    return;
  }
  lastAutoFooterSig.set(component, sig);

  const autoTotals = numericFields.map((c) => {
    const column = c.dataField as string;
    const item: Record<string, unknown> = {
      name: `${AUTO_NUMERIC_SUMMARY_PREFIX}${column}`,
      column,
      showInColumn: column,
      summaryType: "sum",
      skipEmptyValues: true,
    };
    if (c.format !== undefined && c.format !== null) {
      item.valueFormat = c.format;
    }
    return item;
  });

  const nextTotals = [...userTotals, ...autoTotals];

  component.option("summary", {
    ...summaryOption,
    totalItems: nextTotals,
    recalculateWhileEditing: summaryOption?.recalculateWhileEditing ?? true,
  });
}

/** DevExtreme DataGrid with toolbar, header filters, filter builder below, export, and optional state. */
export const AppDataGrid = forwardRef<DataGridRef, AppDataGridProps>(
  function AppDataGrid(
    {
      className,
      showBorders,
      rowAlternationEnabled,
      columnAutoWidth,
      width,
      height,
      allowColumnReordering,
      allowColumnResizing,
      columnResizingMode,
      columnMinWidth,
      persistenceKey,
      searchPanelWidth,
      searchPlaceholder,
      showAddRowButton,
      toolbarItems,
      autoNumericFooter,
      exportFileName,
      permissionResource,
      showFilterBuilder = true,
      onContentReady,
      onExporting: onExportingProp,
      onToolbarPreparing: onToolbarPreparingProp,
      onOptionChanged: onOptionChangedProp,
      filterValue: filterValueProp,
      summary,
      columnFixing,
      groupPanel,
      grouping,
      loadPanel,
      children,
      searchPanel: searchPanelProp,
      export: exportProp,
      columnChooser: columnChooserProp,
      ...rest
    },
    ref,
  ) {
    const pagePerms = usePagePermissions(permissionResource);
    const canAdd = pagePerms.canAdd;
    const showAdd = showAddRowButton !== false;

    const [filterFields, setFilterFields] = useState<Field[]>([]);
    const [filterValue, setFilterValue] = useState<any>(filterValueProp);

    const handleToolbarPreparing = useCallback(
      (e: ToolbarPreparingEvent) => {
        onToolbarPreparingProp?.(e);
        if (!permissionResource || canAdd) {
          return;
        }
        for (const item of e.toolbarOptions.items ?? []) {
          if (item && typeof item === "object" && "name" in item && item.name === "addRowButton") {
            item.options = { ...(item.options as object), disabled: true };
          }
        }
      },
      [onToolbarPreparingProp, permissionResource, canAdd],
    );

    const searchPanel = {
      visible: true,
      highlightCaseSensitive: false,
      width: searchPanelWidth ?? 360,
      placeholder: searchPlaceholder ?? "Search this list…",
      ...(typeof searchPanelProp === "object" && searchPanelProp !== null ? searchPanelProp : {}),
    };

    const exportOpts = {
      enabled: true,
      allowExportSelectedData: true,
      formats: ["xlsx"],
      ...(typeof exportProp === "object" && exportProp !== null ? exportProp : {}),
    };

    const excelExportBaseName =
      exportFileName ?? gridExportFileName(persistenceKey);

    const handleExporting = useCallback(
      (e: ExportingEvent) => {
        const fmt = String(e.format ?? "xlsx").toLowerCase();
        if (fmt === "xlsx") {
          void exportDataGridToExcel(e, excelExportBaseName).catch((err: unknown) => {
            notify(getErrorMessage(err, "Excel export failed"), "error", 5000);
          });
          return;
        }
        onExportingProp?.(e);
      },
      [onExportingProp, excelExportBaseName],
    );

    const columnChooserOpts = {
      enabled: true,
      mode: "select" as const,
      ...(typeof columnChooserProp === "object" && columnChooserProp !== null
        ? columnChooserProp
        : {}),
    };

    const columnFixingOpts = mergeGridSection(
      { enabled: true },
      columnFixing as Partial<{ enabled: boolean }> | undefined,
    );

    const groupPanelOpts = mergeGridSection(
      {
        visible: true,
        allowColumnDragging: true,
        emptyPanelText: "Drag a column header here to group by that column",
      },
      groupPanel as Partial<{
        visible: boolean;
        allowColumnDragging: boolean;
        emptyPanelText: string;
      }> | undefined,
    );

    const groupingOpts = mergeGridSection(
      {
        allowCollapsing: true,
        autoExpandAll: true,
        contextMenuEnabled: true,
      },
      grouping as Partial<{
        allowCollapsing: boolean;
        autoExpandAll: boolean;
        contextMenuEnabled: boolean;
      }> | undefined,
    );

    const loadPanelOpts = mergeGridSection(
      { enabled: false as boolean | "auto" },
      loadPanel as Partial<{ enabled: boolean | "auto" }> | undefined,
    );

    const handleOptionChanged = useCallback(
      (e: OptionChangedEvent) => {
        onOptionChangedProp?.(e);
        if (showFilterBuilder && e.fullName === "filterValue") {
          setFilterValue(e.value);
        }
      },
      [onOptionChangedProp, showFilterBuilder],
    );

    const handleContentReady = useCallback(
      (e: ContentReadyEvent) => {
        onContentReady?.(e);
        const grid = e.component;
        queueMicrotask(() => {
          try {
            if (showFilterBuilder) {
              setFilterFields(buildFilterFields(grid));
              const stored = grid.option("filterValue");
              if (stored !== undefined && stored !== null) {
                setFilterValue(stored);
              }
            }
            if (autoNumericFooter !== false) {
              applyAutoNumericSummaries(grid);
            }
          } catch {
            /* widget may be disposed before the microtask runs */
          }
        });
      },
      [onContentReady, autoNumericFooter, showFilterBuilder],
    );

    const shellStyle =
      height !== undefined && height !== null
        ? { height: height as string | number }
        : undefined;

    return (
      <div
        className={["app-data-grid-shell", className].filter(Boolean).join(" ")}
        style={shellStyle}
      >
        <div className="app-data-grid-shell__grid">
          <DataGrid
            ref={ref}
            className={["dx-datagrid-app", "dx-card", "wide-card"].filter(Boolean).join(" ")}
            showBorders={showBorders ?? true}
            showColumnLines={rest.showColumnLines ?? true}
            showRowLines={rest.showRowLines ?? true}
            rowAlternationEnabled={rowAlternationEnabled ?? true}
            columnAutoWidth={columnAutoWidth ?? true}
            columnMinWidth={columnMinWidth ?? 64}
            width={width ?? "100%"}
            height="100%"
            allowColumnReordering={allowColumnReordering ?? true}
            allowColumnResizing={allowColumnResizing ?? true}
            columnResizingMode={columnResizingMode ?? "widget"}
            columnFixing={columnFixingOpts}
            groupPanel={groupPanelOpts}
            grouping={groupingOpts}
            searchPanel={searchPanel}
            export={exportOpts}
            columnChooser={columnChooserOpts}
            loadPanel={loadPanelOpts}
            summary={summary}
            filterValue={showFilterBuilder ? filterValue : filterValueProp}
            onContentReady={handleContentReady}
            onExporting={handleExporting}
            onToolbarPreparing={handleToolbarPreparing}
            onOptionChanged={handleOptionChanged}
            {...rest}
          >
            <Toolbar>
              {showAdd ? <ToolbarItem name="addRowButton" location="before" /> : null}
              {toolbarItems}
              <ToolbarItem name="searchPanel" locateInMenu="auto" />
              <ToolbarItem name="exportButton" locateInMenu="auto" />
              <ToolbarItem name="columnChooserButton" locateInMenu="auto" />
            </Toolbar>
            <HeaderFilter visible allowSearch />
            {persistenceKey ? (
              <StateStoring
                enabled
                type="localStorage"
                storageKey={persistenceKey}
                savingTimeout={500}
              />
            ) : null}
            {children}
          </DataGrid>
        </div>
        {showFilterBuilder && filterFields.length > 0 ? (
          <div className="app-data-grid-shell__filter-builder">
            <div className="app-data-grid-shell__filter-builder-label">Filter</div>
            <FilterBuilder
              fields={filterFields}
              value={filterValue}
              onValueChanged={(e) => setFilterValue(e.value)}
            />
          </div>
        ) : null}
      </div>
    );
  },
);
