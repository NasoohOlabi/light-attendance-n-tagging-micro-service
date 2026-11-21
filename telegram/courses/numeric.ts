export const numeric = (input: string): number | null => {
  const text = input
    .trim()
    .replace(/[\u0660-\u0669\u06f0-\u06f9]/g, (digit) =>
      String(digit.charCodeAt(0) - (digit.charCodeAt(0) < 0x06f0 ? 0x0660 : 0x06f0)),
    )
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) return null
  return Number(text)
}
