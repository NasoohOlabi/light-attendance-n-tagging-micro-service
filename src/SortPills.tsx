import { DragDropProvider } from '@dnd-kit/react'
import {
  Accessibility,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from '@dnd-kit/dom'
import { isSortable } from '@dnd-kit/react/sortable'
import { useId } from 'react'
import { useSortable } from '@dnd-kit/react/sortable'
import { move } from '@dnd-kit/helpers'
import {
  ArrowDown,
  ArrowUp,
  FilterX,
  GripVertical,
  HelpCircle,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import type { SortingState } from '@tanstack/react-table'

type Column = { id: string; label: string }

function Pill({
  item,
  index,
  label,
  ar,
  change,
  remove,
}: {
  item: SortingState[number]
  index: number
  label: string
  ar: boolean
  change: () => void
  remove: () => void
}) {
  const { ref, handleRef, isDragging } = useSortable({ id: item.id, index })
  const direction = item.desc ? (ar ? 'تنازلي' : 'Descending') : ar ? 'تصاعدي' : 'Ascending'
  return (
    <div ref={ref} className={`sort-pill${isDragging ? ' is-dragging' : ''}`}>
      <button
        ref={handleRef}
        type="button"
        className="sort-grip"
        aria-label={`${ar ? 'ترتيب' : 'Reorder'} ${label}`}
        title={ar ? 'اسحب لتغيير الأولوية' : 'Drag to change priority'}
      >
        <GripVertical size={16} aria-hidden="true" />
      </button>
      <span className="sort-pill-label">
        <span className="sort-pill-number">{index + 1}</span>
        {label}
      </span>
      <button
        type="button"
        aria-label={`${ar ? 'اتجاه الفرز' : 'Sort direction'} ${index + 1}: ${direction}`}
        title={direction}
        onClick={change}
      >
        {item.desc ? (
          <ArrowDown size={16} aria-hidden="true" />
        ) : (
          <ArrowUp size={16} aria-hidden="true" />
        )}
      </button>
      <button
        type="button"
        aria-label={`${ar ? 'إزالة الفرز' : 'Remove sort'} ${index + 1}`}
        title={ar ? 'إزالة' : 'Remove'}
        onClick={remove}
      >
        <X size={15} aria-hidden="true" />
      </button>
    </div>
  )
}

export function SortPills({
  columns,
  sorting,
  setSorting,
  reset,
  resetSort,
  ar,
  filtersEnabled,
}: {
  columns: Column[]
  sorting: SortingState
  setSorting: (items: SortingState) => void
  reset: () => void
  resetSort: () => void
  ar: boolean
  filtersEnabled: boolean
}) {
  const helpId = useId()
  const available = columns.filter((column) => !sorting.some((item) => item.id === column.id))
  return (
    <div className="sort-toolbar">
      <span className="sort-toolbar-label">
        <SlidersHorizontal size={16} aria-hidden="true" />
        {ar ? 'الفرز' : 'Sort'}
      </span>
      <DragDropProvider
        key={ar ? 'ar' : 'en'}
        plugins={(defaults) =>
          defaults.map((plugin) =>
            plugin === Accessibility
              ? Accessibility.configure({
                  screenReaderInstructions: {
                    draggable: ar
                      ? 'اضغط مسافة للإمساك والإفلات، والأسهم للتحريك، وEscape للإلغاء.'
                      : 'Press Space to pick up and drop, arrows to move, and Escape to cancel.',
                  },
                  announcements: {
                    dragstart: ({ operation }: DragStartEvent) =>
                      `${columns.find((column) => column.id === operation.source?.id)?.label ?? ''}: ${ar ? 'تم الإمساك' : 'picked up'}`,
                    dragover: ({ operation }: DragOverEvent) =>
                      isSortable(operation.source)
                        ? `${ar ? 'الأولوية' : 'Priority'} ${operation.source.index + 1}`
                        : undefined,
                    dragend: (event: DragEndEvent) =>
                      event.canceled
                        ? ar
                          ? 'تم إلغاء الترتيب'
                          : 'Reordering canceled'
                        : ar
                          ? 'تم الإفلات'
                          : 'Dropped',
                  },
                })
              : plugin,
          )
        }
        onDragEnd={(event) => {
          if (!event.canceled) setSorting(move(sorting, event))
        }}
      >
        {sorting.map((item, index) => (
          <Pill
            key={item.id}
            item={item}
            index={index}
            label={columns.find((column) => column.id === item.id)?.label ?? item.id}
            ar={ar}
            change={() =>
              setSorting(
                sorting.map((entry) =>
                  entry.id === item.id ? { ...entry, desc: !entry.desc } : entry,
                ),
              )
            }
            remove={() => setSorting(sorting.filter((entry) => entry.id !== item.id))}
          />
        ))}
      </DragDropProvider>
      {available.length > 0 && (
        <label className="sort-add" title={ar ? 'إضافة عمود' : 'Add column'}>
          <Plus size={16} aria-hidden="true" />
          <span>{ar ? 'إضافة عمود' : 'Add column'}</span>
          <select
            aria-label={ar ? 'إضافة عمود' : 'Add column'}
            value=""
            onChange={(event) => {
              if (event.target.value)
                setSorting([...sorting, { id: event.target.value, desc: false }])
            }}
          >
            <option value="" disabled>
              {ar ? 'إضافة عمود' : 'Add column'}
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
        className="sort-tool"
        type="button"
        aria-label={ar ? 'إعادة ضبط الفرز' : 'Reset sort'}
        title={ar ? 'إعادة ضبط الفرز' : 'Reset sort'}
        onClick={resetSort}
      >
        <RotateCcw size={16} aria-hidden="true" />
      </button>
      {filtersEnabled && (
        <button
          className="sort-tool"
          type="button"
          aria-label={ar ? 'مسح الفرز والتصفية' : 'Clear sort and filters'}
          title={ar ? 'مسح الفرز والتصفية' : 'Clear sort and filters'}
          onClick={reset}
        >
          <FilterX size={16} aria-hidden="true" />
        </button>
      )}
      <button
        className="sort-help"
        type="button"
        popoverTarget={helpId}
        aria-label={ar ? 'مساعدة الفرز' : 'Sort help'}
        title={ar ? 'مساعدة الفرز' : 'Sort help'}
      >
        <HelpCircle size={16} aria-hidden="true" />
      </button>
      <div id={helpId} popover="auto" className="sort-help-popover">
        {ar
          ? 'اسحب لتغيير الأولوية. انقر عنوان العمود للفرز واستخدم Shift لإضافة عمود. لوحة المفاتيح: مسافة للإمساك والإفلات، والأسهم للتحريك، وEscape للإلغاء.'
          : 'Drag to change priority. Click a heading to sort; Shift-click to add a column. Keyboard: Space to grab and drop, arrows to move, Escape to cancel.'}
        {filtersEnabled &&
          (ar
            ? ' تتقاطع فلاتر الأعمدة معاً؛ النص يطابق جزءاً من القيمة والخيارات تطابقها تماماً.'
            : ' Filters combine (AND). Text matches part of a value; choices match exactly.')}
      </div>
    </div>
  )
}
