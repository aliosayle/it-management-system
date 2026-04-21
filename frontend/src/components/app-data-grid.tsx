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
        columnMinWidth={columnMinWidth ?? 80}
        width={width ?? "100%"}
        allowColumnReordering={allowColumnReordering ?? true}
        {...rest}
      >
        <SearchPanel visible highlightCaseSensitive={false} width={260} />
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
