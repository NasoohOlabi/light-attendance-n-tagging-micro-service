import { expect, type Locator } from '@playwright/test'

export function recordActions(record: Locator) {
  return record.getByRole('button', { name: /^(Actions for |إجراءات )/ })
}

export async function clickRecordAction(record: Locator, name: string) {
  const direct = record.getByRole('button', { name, exact: true })
  if (await direct.isVisible()) return direct.click()
  const courseLink = record.locator('a[href*="courseView=students"]')
  if (
    ['Manage students', 'Grades', 'History', 'إدارة الطلاب', 'الدرجات', 'السجل'].includes(name) &&
    (await courseLink.count())
  ) {
    await courseLink.click()
    if (!['Manage students', 'إدارة الطلاب'].includes(name))
      await record
        .page()
        .getByRole('navigation', { name: /Course sections|أقسام الدورة/ })
        .getByRole('link', {
          name:
            name === 'Grades'
              ? 'Course grades'
              : name === 'History'
                ? 'Course history'
                : name === 'الدرجات'
                  ? 'درجات الدورة'
                  : 'سجل الدورة',
          exact: true,
        })
        .click()
    return
  }
  const action = record.getByRole('button', { name, exact: true })
  const trigger = recordActions(record)
  await expect(action.or(trigger).first()).toBeVisible()
  if (!(await action.isVisible())) await trigger.click()
  await action.click()
}
