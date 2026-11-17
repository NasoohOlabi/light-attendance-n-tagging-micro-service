import {
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table'
import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react'
import { useLanguage } from './i18n'
import { setTableQuery, useTableQuery } from './queryState'

type Value = string | number | null | undefined
export type TableColumn<T> = {
  id: string
  label: string
  value: (row: T) => Value
  choices?: string[]
  filterText?: (row: T) => string
}

export function useDataTable<T>(id: string, data: T[], columns: TableColumn<T>[]) {
  const { language } = useLanguage()
  const query = useTableQuery(id)
  const ids = new Set(columns.map((column) => column.id))
  const state = {
    sorting: query.sorting.filter((item) => ids.has(item.id)),
    filters: query.filters.filter((item) => {
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
    enableMultiSort: false,
    sortDescFirst: false,
    autoResetPageIndex: false,
  })
  return {
    table,
    rows: table.getRowModel().rows.map((row) => row.original),
    columns,
    reset: () => setTableQuery(id, { sorting: [], filters: [] }),
  }
}

export function TableHeader<T>({
  model,
  actions = false,
}: {
  model: ReturnType<typeof useDataTable<T>>
  actions?: boolean
}) {
  const { language } = useLanguage()
  const ar = language === 'ar'
  return (
    <thead>
      <tr>
        {model.columns.map(({ id, label, choices }, index) => {
          const column = model.table.getColumn(id)
          if (!column) return null
          const sort = column.getIsSorted()
          const Chevron =
            sort === 'asc' ? ChevronUp : sort === 'desc' ? ChevronDown : ChevronsUpDown
          return (
            <th
              scope="col"
              key={id}
              aria-label={label}
              aria-sort={sort === 'asc' ? 'ascending' : sort === 'desc' ? 'descending' : 'none'}
            >
              <button
                type="button"
                className="table-sort"
                aria-label={`${ar ? 'ترتيب حسب' : 'Sort by'} ${label}`}
                onClick={column.getToggleSortingHandler()}
              >
                <span className="table-sort-label">{label}</span>
                <Chevron
                  className="table-sort-chevron"
                  size={14}
                  strokeWidth={1.6}
                  aria-hidden="true"
                  focusable="false"
                />
              </button>
              <div className="table-filter-row">
                {choices ? (
                  <select
                    className="table-filter"
                    aria-label={`${ar ? 'تصفية' : 'Filter'} ${label}`}
                    value={String(column.getFilterValue() ?? '')}
                    onChange={(event) => column.setFilterValue(event.target.value)}
                  >
                    <option value="">{ar ? 'الكل' : 'All'}</option>
                    {choices.map((choice, choiceIndex) => (
                      <option key={choiceIndex} value={String(choiceIndex + 1)}>
                        {choice}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    className="table-filter"
                    type="search"
                    maxLength={200}
                    dir="auto"
                    aria-label={`${ar ? 'تصفية' : 'Filter'} ${label}`}
                    value={String(column.getFilterValue() ?? '')}
                    onChange={(event) => column.setFilterValue(event.target.value)}
                  />
                )}
                {index === 0 && (
                  <button
                    type="button"
                    className="table-reset"
                    aria-label={ar ? 'مسح الفرز والتصفية' : 'Clear sort and filters'}
                    title={ar ? 'مسح الفرز والتصفية' : 'Clear sort and filters'}
                    onClick={model.reset}
                  />
                )}
              </div>
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
  )
}
