import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react'
import type { ReactNode } from 'react'
import { useLanguage } from './useLanguage'
import { SortPills } from './SortPills'
import { TableFilters } from './TableFilters'
import type { useDataTable } from './useDataTable'

function TableControls<T>({ model }: { model: ReturnType<typeof useDataTable<T>> }) {
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

export function TableToolbar<T>({
  model,
  children,
  actions,
  className = '',
}: {
  model?: ReturnType<typeof useDataTable<T>>
  children: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <header className={`table-toolbar ${className}`}>
      {children}
      {(model || actions) && (
        <div className="table-toolbar-actions">
          {actions}
          {model && <TableControls model={model} />}
        </div>
      )}
    </header>
  )
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
  const sorting = model.table.getState().sorting
  const setSorting = model.table.setSorting
  return (
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
            <span>{ar ? 'الإجراءات' : 'Actions'}</span>
          </th>
        )}
      </tr>
    </thead>
  )
}
