import { EllipsisVertical, type LucideIcon } from 'lucide-react'
import { useId, useRef } from 'react'

type Action = { label: string; onClick: () => void; disabled?: boolean }

type RowActionsProps = {
  name: string
  ar: boolean
} & (
  | { inlineIcons?: false; actions: Action[] }
  | { inlineIcons: true; actions: (Action & { icon: LucideIcon })[] }
)

export function RowActions(props: RowActionsProps) {
  const { name, ar, actions } = props
  const id = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const popup = useRef<HTMLDivElement>(null)
  const label = ar ? `إجراءات ${name}` : `Actions for ${name}`
  const overflowClass = props.inlineIcons ? ' course-actions-overflow' : ''
  return (
    <>
      {props.inlineIcons && (
        <div className="course-actions-inline" role="group" aria-label={label}>
          {props.actions.map(({ label, icon: Icon, disabled, onClick }) => (
            <button
              key={label}
              type="button"
              className="icon-button"
              aria-label={label}
              title={label}
              disabled={disabled}
              onClick={onClick}
            >
              <Icon size={20} aria-hidden="true" />
            </button>
          ))}
        </div>
      )}
      <button
        ref={trigger}
        type="button"
        className={`icon-button${overflowClass}`}
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
        className={`table-control-popup row-actions-popup${overflowClass}`}
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
