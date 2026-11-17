import { useState, type ComponentProps } from 'react'

import { formatLevel } from './levelFormat'

export function LevelInput({
  value,
  ...props
}: Omit<ComponentProps<'input'>, 'value'> & { value: string }) {
  const [focused, setFocused] = useState(false)
  return (
    <input
      {...props}
      value={focused ? value : formatLevel(value)}
      onFocus={(event) => {
        setFocused(true)
        props.onFocus?.(event)
      }}
      onBlur={(event) => {
        setFocused(false)
        props.onBlur?.(event)
      }}
    />
  )
}
