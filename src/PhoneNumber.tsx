import { phoneNumber } from './phoneFormat'

export function PhoneNumber({ value }: { value: string }) {
  const { display, href } = phoneNumber(value)
  if (!href) return <bdi dir="ltr">{display}</bdi>
  return (
    <a
      href={href}
      dir="ltr"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        minHeight: 44,
        minWidth: 44,
        maxWidth: '100%',
        overflowWrap: 'anywhere',
        wordBreak: 'break-all',
        textDecoration: 'underline',
        unicodeBidi: 'isolate',
      }}
    >
      {display}
    </a>
  )
}
