import type { Locator } from '@playwright/test'

export function recordActions(record: Locator) {
  return record.getByRole('button', { name: /^(Actions for |إجراءات )/ })
}

export async function clickRecordAction(record: Locator, name: string) {
  await recordActions(record).click()
  await record.getByRole('button', { name, exact: true }).click()
}
