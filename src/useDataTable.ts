import {
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table'
import { useLanguage } from './useLanguage'
import { setTableQuery, useTableQuery } from './queryState'

type Value = string | number | null | undefined
export type TableColumn<T> = {
  id: string
  label: string
  value: (row: T) => Value
  choices?: string[]
  filterText?: (row: T) => string
}

export function useDataTable<T>(
  id: string,
  data: T[],
  columns: TableColumn<T>[],
  filtersEnabled = true,
) {
  const { language } = useLanguage()
  const query = useTableQuery(id)
  const ids = new Set(columns.map((column) => column.id))
  const state = {
    sorting: query.sorting.filter(
      (item, index, items) =>
        ids.has(item.id) && items.findIndex((entry) => entry.id === item.id) === index,
    ),
    filters: (filtersEnabled ? query.filters : []).filter((item) => {
      const column = columns.find((entry) => entry.id === item.id)
      return (
        column &&
        (!column.choices || column.choices.some((_, index) => item.value === String(index + 1)))
      )
    }),
  }
  const definitions: ColumnDef<T, Value>[] = columns.map((column) => ({
    id: column.id,
    accessorFn: (row) => {
      const value = column.value(row)
      return value == null || value === '' ? undefined : value
    },
    sortUndefined: 'last',
    sortingFn: (a, b, columnId) => {
      const x = a.getValue<Value>(columnId)
      const y = b.getValue<Value>(columnId)
      if (x == null || x === '') return y == null || y === '' ? 0 : 1
      if (y == null || y === '') return -1
      return typeof x === 'number' && typeof y === 'number'
        ? x - y
        : String(x).localeCompare(String(y), language, { numeric: true, sensitivity: 'base' })
    },
    filterFn: (row, columnId, value: string) => {
      const text = (
        column.filterText?.(row.original) ?? String(row.getValue<Value>(columnId) ?? '')
      ).toLocaleLowerCase()
      return column.choices
        ? text === (column.choices[Number(value) - 1] ?? '').toLocaleLowerCase()
        : text.includes(value.toLocaleLowerCase())
    },
  }))
  // The table exposes mutable getters. Keep them outside compiler memoization.
  // oxlint-disable-next-line react/incompatible-library
  const table = useReactTable({
    // Draft values can change without changing the source array identity.
    data: [...data],
    columns: definitions,
    state: { sorting: state.sorting, columnFilters: state.filters },
    onSortingChange: (updater) =>
      setTableQuery(id, {
        ...state,
        sorting: typeof updater === 'function' ? updater(state.sorting) : updater,
      }),
    onColumnFiltersChange: (updater) => {
      const filters = typeof updater === 'function' ? updater(state.filters) : updater
      setTableQuery(id, {
        ...state,
        filters: filters.flatMap((item) =>
          typeof item.value === 'string' ? [{ id: item.id, value: item.value }] : [],
        ),
      })
    },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableMultiSort: true,
    sortDescFirst: false,
    autoResetPageIndex: false,
  })
  return {
    table,
    rows: table.getRowModel().rows.map((row) => row.original),
    columns,
    filtersEnabled,
    reset: () => setTableQuery(id, { sorting: [], filters: [] }),
    resetSort: () => setTableQuery(id, { ...state, sorting: [] }),
  }
}
