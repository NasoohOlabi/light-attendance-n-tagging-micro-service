import { EllipsisVertical } from 'lucide-react'
import { useEffect, useId, useRef } from 'react'

type Action = { label: string; onClick: () => void; disabled?: boolean }

export function RowActions({
  name,
  ar,
  actions,
  rowShortcut = false,
}: {
  name: string
  ar: boolean
  actions: Action[]
  rowShortcut?: boolean
}) {
  const id = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const popup = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const row = trigger.current?.closest('tr')
    if (!rowShortcut || !row) return
    let started = 0
    let startX = 0
    let startY = 0
    let target: EventTarget | null = null
    const cancel = () => {
      started = 0
      target = null
    }
    const eligible = (element: EventTarget | null) =>
      element instanceof Element &&
      (element instanceof HTMLTableCellElement || element === row) &&
      !element.closest('a, button, input, textarea, select, label, [contenteditable], [popover]') &&
      !window.getSelection()?.toString()
    const open = () => {
      popup.current?.showPopover()
      trigger.current?.focus()
    }
    const context = (event: MouseEvent) => {
      if (!eligible(event.target)) return
      event.preventDefault()
      if (!started) open()
    }
    const down = (event: TouchEvent) => {
      const touch = event.touches[0]
      if (event.touches.length !== 1 || !touch || !eligible(event.target)) return
      started = Date.now()
      target = event.target
      startX = touch.clientX
      startY = touch.clientY
    }
    const move = (event: TouchEvent) => {
      const touch = event.touches[0]
      if (!touch || Math.hypot(touch.clientX - startX, touch.clientY - startY) > 10) cancel()
    }
    const up = () => {
      const shouldOpen = started > 0 && Date.now() - started >= 600 && eligible(target)
      cancel()
      if (shouldOpen) setTimeout(open, 100)
    }
    window.addEventListener('scroll', cancel, true)
    row.addEventListener('contextmenu', context)
    row.addEventListener('touchstart', down, { passive: true })
    row.addEventListener('touchmove', move, { passive: true })
    row.addEventListener('touchend', up)
    row.addEventListener('touchcancel', cancel)
    return () => {
      window.removeEventListener('scroll', cancel, true)
      row.removeEventListener('contextmenu', context)
      row.removeEventListener('touchstart', down)
      row.removeEventListener('touchmove', move)
      row.removeEventListener('touchend', up)
      row.removeEventListener('touchcancel', cancel)
    }
  }, [rowShortcut])
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
