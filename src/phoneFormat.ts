export function phoneNumber(value: string) {
  const text = value.trim()
  if (!/^\+?[0-9 ()-]+$/.test(text)) return { display: text, href: null }
  const digits = text.replace(/\D/g, '')
  // ponytail: length alone cannot identify every country code; use a phone library if needed.
  const prefix = !text.startsWith('+') && digits.startsWith('00') && digits.length >= 12
  const number = prefix ? digits.slice(2) : digits
  if (
    number.length < 3 ||
    number.length > 15 ||
    ((prefix || text.startsWith('+')) && number.startsWith('0'))
  )
    return { display: text, href: null }
  const international = !text.startsWith('+') && !digits.startsWith('0') && digits.length >= 11
  const display = prefix ? `+${number}` : international ? `+${text}` : text
  const dial = prefix || international || text.startsWith('+') ? `+${number}` : number
  return { display, href: `tel:${dial}` }
}
