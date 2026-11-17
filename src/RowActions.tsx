import { EllipsisVertical } from 'lucide-react'
import { useId, useRef } from 'react'

type Action = { label: string; onClick: () => void; disabled?: boolean }

export function RowActions({
  name,
  ar,
  actions,
}: {
  name: string
  ar: boolean
  actions: Action[]
}) {
  const id = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const popup = useRef<HTMLDivElement>(null)
  const label = ar ? `إجراءات ${name}` : `Actions for ${name}`
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="icon-button"
        popoverTarget={id}
        aria-label={label}
        title={label}
      >
        <EllipsisVertical size={20} aria-hidden="true" />
      </button>
      <div
        ref={popup}
        id={id}
        popover="auto"
        role="group"
        className="table-control-popup row-actions-popup"
        aria-label={label}
      >
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            disabled={action.disabled}
            onClick={() => {
              popup.current?.hidePopover()
              trigger.current?.focus()
              action.onClick()
            }}
          >
            {action.label}
          </button>
        ))}
      </div>
    </>
  )
}
