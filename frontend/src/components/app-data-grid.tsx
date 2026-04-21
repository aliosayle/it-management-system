import { forwardRef, type ComponentPropsWithoutRef } from "react";
import DataGrid, {
  type DataGridRef,
  SearchPanel,
  HeaderFilter,
  ColumnChooser,
  Export,
  StateStoring,
} from "devextreme-react/data-grid";

export type AppDataGridProps = ComponentPropsWithoutRef<typeof DataGrid> & {
  /** When set, column order / width / filters persist in localStorage */
  persistenceKey?: string;
  /** Toolbar search box width (default 360) */
  searchPanelWidth?: number;
  searchPlaceholder?: string;
};

/** DevExtreme DataGrid with search, header filters, column chooser, reorder, export, optional state. */
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
      children,
      ...rest
    },
    ref,
  ) {
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
        {...rest}
      >
        <SearchPanel
          visible
          highlightCaseSensitive={false}
          width={searchPanelWidth ?? 360}
          placeholder={searchPlaceholder ?? "Search this list…"}
        />
        <HeaderFilter visible allowSearch />
        <ColumnChooser enabled mode="select" />
        <Export enabled allowExportSelectedData />
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
