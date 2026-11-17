import { Filter, Plus, RotateCcw, X } from 'lucide-react'
import { useId, useState } from 'react'
import type { useDataTable } from './DataTable'

export function TableFilters<T>({
  model,
  ar,
}: {
  model: ReturnType<typeof useDataTable<T>>
  ar: boolean
}) {
  const popupId = useId()
  const [added, setAdded] = useState<string[]>([])
  const active = model.table.getState().columnFilters.map((filter) => filter.id)
  const selected = new Set([...active, ...added])
  const available = model.columns.filter((column) => !selected.has(column.id))
  return (
    <div className="sort-toolbar">
      <button
        type="button"
        className="table-control-trigger"
        popoverTarget={popupId}
        aria-label={ar ? 'خيارات التصفية' : 'Filter options'}
        title={ar ? 'خيارات التصفية' : 'Filter options'}
      >
        <Filter size={18} aria-hidden="true" />
        {active.length > 0 && <span className="table-control-count">{active.length}</span>}
      </button>
      <div
        id={popupId}
        popover="auto"
        role="dialog"
        className="table-control-popup"
        aria-label={ar ? 'خيارات التصفية' : 'Filter options'}
      >
        <div className="table-popup-header">
          <strong>{ar ? 'التصفية' : 'Filters'}</strong>
          <button
            type="button"
            popoverTarget={popupId}
            popoverTargetAction="hide"
            aria-label={ar ? 'إغلاق' : 'Close'}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="filter-popup-content">
          {model.columns
            .filter((column) => selected.has(column.id))
            .map(({ id, label, choices }) => {
              const column = model.table.getColumn(id)
              if (!column) return null
              return (
                <div className="filter-criterion" key={id}>
                  <label>
                    {label}
                    {choices ? (
                      <select
                        className="table-filter"
                        aria-label={`${ar ? 'تصفية' : 'Filter'} ${label}`}
                        value={String(column.getFilterValue() ?? '')}
                        onChange={(event) => column.setFilterValue(event.target.value)}
                      >
                        <option value="">{ar ? 'الكل' : 'All'}</option>
                        {choices.map((choice, index) => (
                          <option key={index} value={String(index + 1)}>
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
                  </label>
                  <button
                    type="button"
                    aria-label={`${ar ? 'إزالة التصفية' : 'Remove filter'} ${label}`}
                    onClick={() => {
                      column.setFilterValue(undefined)
                      setAdded((items) => items.filter((item) => item !== id))
                    }}
                  >
                    <X size={16} aria-hidden="true" />
                  </button>
                </div>
              )
            })}
          {available.length > 0 && (
            <label className="sort-add">
              <Plus size={16} aria-hidden="true" />
              <span>{ar ? 'إضافة تصفية' : 'Add filter'}</span>
              <select
                aria-label={ar ? 'إضافة تصفية' : 'Add filter'}
                value=""
                onChange={(event) => {
                  if (event.target.value) setAdded((items) => [...items, event.target.value])
                }}
              >
                <option value="" disabled>
                  {ar ? 'إضافة تصفية' : 'Add filter'}
                </option>
                {available.map((column) => (
                  <option key={column.id} value={column.id}>
                    {column.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            type="button"
            className="filter-reset"
            onClick={() => {
              model.table.resetColumnFilters()
              setAdded([])
            }}
          >
            <RotateCcw size={16} aria-hidden="true" />
            {ar ? 'مسح التصفية' : 'Clear filters'}
          </button>
        </div>
      </div>
    </div>
  )
}
