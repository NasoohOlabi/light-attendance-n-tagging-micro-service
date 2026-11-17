export function formatLevel(value: string) {
  return value.replace(/^(\d+)\.0+$/, '$1')
}
