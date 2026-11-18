import { expect, type Locator } from '@playwright/test'

export function recordActions(record: Locator) {
  return record.getByRole('button', { name: /^(Actions for |إجراءات )/ })
}

export async function clickRecordAction(record: Locator, name: string) {
  const action = record.getByRole('button', { name, exact: true })
  const trigger = recordActions(record)
  await expect(action.or(trigger).first()).toBeVisible()
  if (!(await action.isVisible())) await trigger.click()
  await action.click()
}
