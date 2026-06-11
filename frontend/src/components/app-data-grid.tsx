import {
  forwardRef,
  useCallback,
  useRef,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";
import type { ToolbarPreparingEvent } from "devextreme/ui/data_grid";
import type dxDataGrid from "devextreme/ui/data_grid";
import { usePagePermissions } from "../hooks/use-permissions";
import type { PermissionResource } from "../lib/permissions";
import DataGrid, {
  type DataGridRef,
  Toolbar,
  Item as ToolbarItem,
  HeaderFilter,
  StateStoring,
} from "devextreme-react/data-grid";
import notify from "devextreme/ui/notify";
import type { ContentReadyEvent, ExportingEvent, InitializedEvent } from "devextreme/ui/data_grid";
import { getErrorMessage } from "../utils/error-message";
import {
  exportDataGridToExcel,
  gridExportFileName,
} from "../utils/devextreme-grid-excel-export";

const AUTO_NUMERIC_SUMMARY_PREFIX = "__appAutoSum:";

/** Avoids redundant summary.option() calls (can retrigger load panel / remote reshape). */
const lastAutoFooterSig = new WeakMap<object, string>();

/** columnOption() on master-detail expand columns can clear active filters if repeated. */
const filterSafeColumnsPrepared = new WeakSet<object>();

function mergeGridSection<T extends Record<string, unknown>>(
  defaults: T,
  override: Partial<T> | undefined | null,
): T {
  if (!override || typeof override !== "object") {
    return defaults;
  }
  return { ...defaults, ...override };
}

type ColumnOpts = {
  dataField?: string | null;
  name?: string;
  type?: string;
  command?: string;
  allowFiltering?: boolean;
  allowHeaderFiltering?: boolean;
};

function columnDisallowsFilter(col: ColumnOpts): boolean {
  const noField =
    (col.dataField === undefined || col.dataField === null || col.dataField === "") &&
    !col.name;
  return (
    noField ||
    col.type === "buttons" ||
    col.type === "adaptive" ||
    col.type === "detailExpand" ||
    Boolean(col.command)
  );
}

/**
 * filterSyncEnabled requires dataField or name on every filterable column.
 * Command, master-detail, and button columns must opt out or filter sync throws.
 */
function ensureFilterSafeColumns(grid: dxDataGrid): void {
  if (filterSafeColumnsPrepared.has(grid)) {
    return;
  }

  const indices = new Set<number>();
  const count = grid.columnCount();
  for (let i = 0; i < count; i++) {
    indices.add(i);
  }
  for (const col of grid.getVisibleColumns()) {
    const idx = (col as { index?: number; visibleIndex?: number }).index;
    const visibleIdx = (col as { visibleIndex?: number }).visibleIndex;
    if (typeof idx === "number") {
      indices.add(idx);
    } else if (typeof visibleIdx === "number") {
      indices.add(visibleIdx);
    }
  }

  for (const i of indices) {
    const col = grid.columnOption(i) as ColumnOpts;
    if (!columnDisallowsFilter(col)) {
      continue;
    }
    if (col.allowFiltering !== false || col.allowHeaderFiltering !== false) {
      grid.columnOption(i, {
        allowFiltering: false,
        allowHeaderFiltering: false,
      });
    }
  }

  for (const command of ["expand", "select", "edit", "delete"]) {
    try {
      const col = grid.columnOption(`command:${command}`) as ColumnOpts;
      if (col.allowFiltering !== false || col.allowHeaderFiltering !== false) {
        grid.columnOption(`command:${command}`, {
          allowFiltering: false,
          allowHeaderFiltering: false,
        });
      }
    } catch {
      /* column not present */
    }
  }

  filterSafeColumnsPrepared.add(grid);
}

function isArrayDataSource(grid: dxDataGrid): boolean {
  return Array.isArray(grid.option("dataSource"));
}

/**
 * Combined filter sync (search + header filter + filter panel) is reliable for in-memory arrays.
 * CustomStore / remote sources can hit null dataField during sync (e.g. master-detail expand).
 */
function resolveFilterSyncEnabled(
  grid: dxDataGrid,
  showFilterBuilder: boolean,
  explicit: boolean | "auto" | undefined,
): boolean | "auto" {
  if (explicit !== undefined) {
    return explicit;
  }
  if (!showFilterBuilder) {
    return false;
  }
  return isArrayDataSource(grid) ? "auto" : false;
}

/**
 * Keeps persisted filters but drops shapes DevExtreme cannot restore (e.g. filterValues
 * saved as a scalar instead of an array), which otherwise throw on grid init.
 */
function sanitizeStoredGridState(state: unknown): unknown {
  if (!state || typeof state !== "object") {
    return state;
  }
  const next = { ...(state as Record<string, unknown>) };
  const columns = next.columns;
  if (Array.isArray(columns)) {
    next.columns = columns.map((col) => {
      if (!col || typeof col !== "object") {
        return col;
      }
      const c = { ...(col as Record<string, unknown>) };
      const filterValues = c.filterValues;
      if (
        filterValues !== undefined &&
        filterValues !== null &&
        !Array.isArray(filterValues)
      ) {
        delete c.filterValues;
      }
      return c;
    });
  }
  return next;
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
  /**
   * Integrated DevExtreme filter panel + filter builder (synced with header filter and search).
   * @see https://js.devexpress.com/Documentation/Guide/UI_Components/DataGrid/Filtering_and_Searching/#Filter_Panel_with_Filter_Builder
   */
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

  component.beginUpdate();
  try {
    component.option("summary", {
      ...summaryOption,
      totalItems: nextTotals,
      recalculateWhileEditing: summaryOption?.recalculateWhileEditing ?? true,
    });
  } finally {
    component.endUpdate();
  }
}

/** DevExtreme DataGrid with toolbar, header filters, integrated filter panel/builder, export, and optional state. */
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
      onInitialized: onInitializedProp,
      onExporting: onExportingProp,
      onToolbarPreparing: onToolbarPreparingProp,
      summary,
      columnFixing,
      groupPanel,
      grouping,
      loadPanel,
      filterPanel: filterPanelProp,
      filterBuilder: filterBuilderProp,
      filterSyncEnabled: filterSyncEnabledProp,
      dataSource: dataSourceProp,
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

    const initialFilterSyncEnabled =
      filterSyncEnabledProp ??
      (showFilterBuilder ? (Array.isArray(dataSourceProp) ? "auto" : false) : false);

    const gridRef = useRef<DataGridRef>(null);

    const combinedGridRef = useCallback(
      (node: DataGridRef | null) => {
        gridRef.current = node;
        if (typeof ref === "function") {
          ref(node);
        } else if (ref) {
          ref.current = node;
        }
      },
      [ref],
    );

    const prepareGridColumns = useCallback((grid: dxDataGrid) => {
      try {
        ensureFilterSafeColumns(grid);
      } catch {
        /* columns not ready */
      }
    }, []);

    const handleInitialized = useCallback(
      (e: InitializedEvent) => {
        const grid = e.component;
        if (grid) {
          prepareGridColumns(grid);
          const sync = resolveFilterSyncEnabled(
            grid,
            showFilterBuilder,
            filterSyncEnabledProp,
          );
          if (grid.option("filterSyncEnabled") !== sync) {
            grid.option("filterSyncEnabled", sync);
          }
        }
        onInitializedProp?.(e);
      },
      [onInitializedProp, prepareGridColumns, showFilterBuilder, filterSyncEnabledProp],
    );

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

    const filterPanelOpts = showFilterBuilder
      ? mergeGridSection(
          {
            visible: true,
            texts: {
              createFilter: "Create filter…",
              clearFilter: "Clear filter",
            },
          },
          filterPanelProp as Record<string, unknown> | undefined,
        )
      : mergeGridSection(
          { visible: false },
          filterPanelProp as Record<string, unknown> | undefined,
        );

    const stateStoringCustomLoad = useCallback(() => {
      if (!persistenceKey) {
        return null;
      }
      try {
        const raw = localStorage.getItem(persistenceKey);
        if (!raw) {
          return null;
        }
        return sanitizeStoredGridState(JSON.parse(raw) as unknown);
      } catch {
        return null;
      }
    }, [persistenceKey]);

    const handleContentReady = useCallback(
      (e: ContentReadyEvent) => {
        const grid = e.component;
        prepareGridColumns(grid);
        const sync = resolveFilterSyncEnabled(grid, showFilterBuilder, filterSyncEnabledProp);
        if (grid.option("filterSyncEnabled") !== sync) {
          grid.option("filterSyncEnabled", sync);
        }
        onContentReady?.(e);
        queueMicrotask(() => {
          try {
            prepareGridColumns(grid);
            if (autoNumericFooter !== false) {
              applyAutoNumericSummaries(grid);
            }
          } catch {
            /* widget may be disposed before the microtask runs */
          }
        });
      },
      [
        onContentReady,
        autoNumericFooter,
        prepareGridColumns,
        showFilterBuilder,
        filterSyncEnabledProp,
      ],
    );

    const shellStyle =
      height !== undefined && height !== null
        ? { height: height as string | number }
        : undefined;

    return (
      <div
        className={[
          "app-data-grid-shell",
          showFilterBuilder ? "app-data-grid-shell--filter-panel" : null,
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        style={shellStyle}
      >
        <DataGrid
          ref={combinedGridRef}
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
          filterSyncEnabled={initialFilterSyncEnabled}
          dataSource={dataSourceProp}
          filterPanel={filterPanelOpts}
          filterBuilder={filterBuilderProp}
          summary={summary}
          onInitialized={handleInitialized}
          onContentReady={handleContentReady}
          onExporting={handleExporting}
          onToolbarPreparing={handleToolbarPreparing}
          {...rest}
        >
          <Toolbar>
            {showAdd ? <ToolbarItem name="addRowButton" location="before" /> : null}
            {toolbarItems}
            <ToolbarItem name="searchPanel" locateInMenu="auto" />
            <ToolbarItem name="exportButton" locateInMenu="auto" />
            <ToolbarItem name="columnChooserButton" locateInMenu="auto" />
          </Toolbar>
          <HeaderFilter visible search={{ enabled: true }} />
          {persistenceKey ? (
            <StateStoring
              enabled
              type="custom"
              customLoad={stateStoringCustomLoad}
              customSave={(state) => {
                localStorage.setItem(persistenceKey, JSON.stringify(state));
              }}
              savingTimeout={500}
            />
          ) : null}
          {children}
        </DataGrid>
      </div>
    );
  },
);
