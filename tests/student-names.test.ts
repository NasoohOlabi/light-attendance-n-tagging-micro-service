import { expect, test } from 'bun:test'
import { neonAdminStudentSchema } from '../shared/neon'

test('student names validate structured input and retain legacy name-only compatibility', () => {
  const fields = {
    studentId: '20000000-0000-4000-8000-000000000001',
    teacherId: '10000000-0000-4000-8000-000000000002',
    group: '2',
    active: true,
  }
  expect(
    neonAdminStudentSchema.parse({ ...fields, firstName: ' أحمد محمد ', lastName: ' عبد الله ' }),
  ).toEqual({ ...fields, firstName: 'أحمد محمد', lastName: 'عبد الله' })
  expect(
    neonAdminStudentSchema.safeParse({ ...fields, firstName: 'Mononym', lastName: '' }).success,
  ).toBe(true)
  expect(neonAdminStudentSchema.parse({ ...fields, name: ' Legacy Full Name ' })).toEqual({
    ...fields,
    name: 'Legacy Full Name',
  })
  for (const invalid of [
    { firstName: ' ', lastName: 'Family' },
    { firstName: 'Given' },
    { firstName: 'Given', lastName: 'Family', name: 'Conflicting full name' },
    { firstName: 'x'.repeat(200), lastName: 'y' },
  ])
    expect(neonAdminStudentSchema.safeParse({ ...fields, ...invalid }).success).toBe(false)
})
