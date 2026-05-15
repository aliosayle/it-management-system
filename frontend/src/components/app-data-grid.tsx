import {
  forwardRef,
  useCallback,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";
import DataGrid, {
  type DataGridRef,
  Toolbar,
  Item as ToolbarItem,
  HeaderFilter,
  StateStoring,
} from "devextreme-react/data-grid";
import type { ContentReadyEvent } from "devextreme/ui/data_grid";

const AUTO_NUMERIC_SUMMARY_PREFIX = "__appAutoSum:";

function mergeGridSection<T extends Record<string, unknown>>(
  defaults: T,
  override: Partial<T> | undefined | null,
): T {
  if (!override || typeof override !== "object") {
    return defaults;
  }
  return { ...defaults, ...override };
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
  /**
   * When true (default), a footer total (sum) is added for each visible column with `dataType="number"`.
   * Custom `summary.totalItems` entries are preserved. Set false when you supply your own summary
   * or when totals are not meaningful (e.g. some remote reshape setups).
   */
  autoNumericFooter?: boolean;
};

function applyAutoNumericSummaries(e: ContentReadyEvent): void {
  const component = e.component;
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

  const same =
    nextTotals.length === existingTotals.length &&
    nextTotals.every((b, i) => {
      const a = existingTotals[i];
      return (
        a &&
        a.name === b.name &&
        a.column === b.column &&
        a.summaryType === b.summaryType
      );
    });
  if (same) {
    return;
  }

  component.option("summary", {
    ...summaryOption,
    totalItems: nextTotals,
    recalculateWhileEditing: summaryOption?.recalculateWhileEditing ?? true,
  });
}

/** DevExtreme DataGrid with toolbar: Add, optional extras, search, export, column chooser; header filters; optional state. */
export const AppDataGrid = forwardRef<DataGridRef, AppDataGridProps>(
  function AppDataGrid(
    {
      className,
      showBorders,
      rowAlternationEnabled,
      columnAutoWidth,
      width,
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
      onContentReady,
      summary,
      columnFixing,
      groupPanel,
      grouping,
      children,
      searchPanel: searchPanelProp,
      export: exportProp,
      columnChooser: columnChooserProp,
      ...rest
    },
    ref,
  ) {
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
      ...(typeof exportProp === "object" && exportProp !== null ? exportProp : {}),
    };

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

    const handleContentReady = useCallback(
      (e: ContentReadyEvent) => {
        onContentReady?.(e);
        if (autoNumericFooter !== false) {
          applyAutoNumericSummaries(e);
        }
      },
      [onContentReady, autoNumericFooter],
    );

    return (
      <DataGrid
        ref={ref}
        className={["dx-datagrid-app", "dx-card", "wide-card", className].filter(Boolean).join(" ")}
        showBorders={showBorders ?? true}
        showColumnLines={rest.showColumnLines ?? true}
        showRowLines={rest.showRowLines ?? true}
        rowAlternationEnabled={rowAlternationEnabled ?? true}
        columnAutoWidth={columnAutoWidth ?? true}
        columnMinWidth={columnMinWidth ?? 64}
        width={width ?? "100%"}
        allowColumnReordering={allowColumnReordering ?? true}
        allowColumnResizing={allowColumnResizing ?? true}
        columnResizingMode={columnResizingMode ?? "widget"}
        columnFixing={columnFixingOpts}
        groupPanel={groupPanelOpts}
        grouping={groupingOpts}
        searchPanel={searchPanel}
        export={exportOpts}
        columnChooser={columnChooserOpts}
        summary={summary}
        onContentReady={handleContentReady}
        {...rest}
      >
        <Toolbar>
          {showAddRowButton !== false ? <ToolbarItem name="addRowButton" location="before" /> : null}
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
    );
  },
);
