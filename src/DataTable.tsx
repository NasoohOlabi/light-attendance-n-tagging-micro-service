import {
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table'
import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react'
import { useLanguage } from './i18n'
import { SortPills } from './SortPills'
import { TableFilters } from './TableFilters'
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

export function TableControls<T>({ model }: { model: ReturnType<typeof useDataTable<T>> }) {
  const { language } = useLanguage()
  const ar = language === 'ar'
  const sorting = model.table.getState().sorting
  const setSorting = model.table.setSorting
  return (
    <>
      <SortPills
        columns={model.columns}
        sorting={sorting}
        setSorting={setSorting}
        reset={model.reset}
        resetSort={model.resetSort}
        ar={ar}
        filtersEnabled={model.filtersEnabled}
      />
      {model.filtersEnabled && <TableFilters model={model} ar={ar} />}
    </>
  )
}

export function TableHeader<T>({
  model,
  actions = false,
  showControls = true,
}: {
  model: ReturnType<typeof useDataTable<T>>
  actions?: boolean
  showControls?: boolean
}) {
  const { language } = useLanguage()
  const ar = language === 'ar'
  const sorting = model.table.getState().sorting
  const setSorting = model.table.setSorting
  return (
    <>
      {showControls && (
        <caption className="table-controls">
          <TableControls model={model} />
        </caption>
      )}
      <thead>
        <tr>
          {model.columns.map(({ id, label }) => {
            const column = model.table.getColumn(id)
            if (!column) return null
            const sort = column.getIsSorted()
            const priority = sorting.findIndex((item) => item.id === id)
            const Chevron =
              sort === 'asc' ? ChevronUp : sort === 'desc' ? ChevronDown : ChevronsUpDown
            return (
              <th
                scope="col"
                key={id}
                aria-label={label}
                aria-sort={
                  priority > 0
                    ? undefined
                    : sort === 'asc'
                      ? 'ascending'
                      : sort === 'desc'
                        ? 'descending'
                        : 'none'
                }
              >
                <button
                  type="button"
                  className={`table-sort${sort ? ' is-sorted' : ''}`}
                  aria-label={`${ar ? 'ترتيب حسب' : 'Sort by'} ${label}`}
                  onClick={(event) => {
                    if (event.shiftKey) column.getToggleSortingHandler()?.(event)
                    else
                      setSorting(
                        sort === 'asc'
                          ? [{ id, desc: true }]
                          : sort === 'desc'
                            ? []
                            : [{ id, desc: false }],
                      )
                  }}
                >
                  <span className="table-sort-label">{label}</span>
                  {sort && (
                    <span
                      className="table-sort-priority"
                      aria-label={`${ar ? 'الأولوية' : 'Priority'} ${priority + 1}, ${sort === 'asc' ? (ar ? 'تصاعدي' : 'ascending') : ar ? 'تنازلي' : 'descending'}`}
                    >
                      {priority + 1}
                    </span>
                  )}
                  <Chevron
                    className="table-sort-chevron"
                    size={14}
                    strokeWidth={1.6}
                    aria-hidden="true"
                    focusable="false"
                  />
                </button>
              </th>
            )
          })}
          {actions && (
            <th scope="col" className="table-actions-header">
              {ar ? 'الإجراءات' : 'Actions'}
            </th>
          )}
        </tr>
      </thead>
    </>
  )
}
