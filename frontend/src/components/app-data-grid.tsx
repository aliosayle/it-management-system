import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from "react";
import DataGrid, {
  type DataGridRef,
  Toolbar,
  Item as ToolbarItem,
  HeaderFilter,
  StateStoring,
} from "devextreme-react/data-grid";

export type AppDataGridProps = ComponentPropsWithoutRef<typeof DataGrid> & {
  /** When set, column order / width / filters persist in localStorage */
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
};

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
      columnMinWidth,
      persistenceKey,
      searchPanelWidth,
      searchPlaceholder,
      showAddRowButton,
      toolbarItems,
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

    return (
      <DataGrid
        ref={ref}
        className={["dx-datagrid-app", "dx-card", "wide-card", className].filter(Boolean).join(" ")}
        showBorders={showBorders ?? true}
        rowAlternationEnabled={rowAlternationEnabled ?? true}
        columnAutoWidth={columnAutoWidth ?? true}
        columnMinWidth={columnMinWidth ?? 64}
        width={width ?? "100%"}
        allowColumnReordering={allowColumnReordering ?? true}
        searchPanel={searchPanel}
        export={exportOpts}
        columnChooser={columnChooserOpts}
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
