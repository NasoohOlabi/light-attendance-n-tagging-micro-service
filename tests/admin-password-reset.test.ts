import { expect, test } from 'bun:test'
import { hashPassword, verifyPassword } from 'better-auth/crypto'
import { neonAdminPasswordResetSchema } from '../shared/neon'

test('reset payload enforces the Better Auth password policy and confirmation', async () => {
  const payload = {
    authUserId: 'synthetic-user',
    password: 'synthetic-password',
    passwordConfirmation: 'synthetic-password',
  }
  expect(neonAdminPasswordResetSchema.safeParse(payload).success).toBe(true)
  expect(
    neonAdminPasswordResetSchema.safeParse({ ...payload, passwordConfirmation: 'different' })
      .success,
  ).toBe(false)
  expect(
    neonAdminPasswordResetSchema.safeParse({
      ...payload,
      password: 'short',
      passwordConfirmation: 'short',
    }).success,
  ).toBe(false)
  expect(
    neonAdminPasswordResetSchema.safeParse({
      ...payload,
      password: 'x'.repeat(129),
      passwordConfirmation: 'x'.repeat(129),
    }).success,
  ).toBe(false)
  const hash = await hashPassword(payload.password)
  expect(await verifyPassword({ hash, password: payload.password })).toBe(true)
  expect(await verifyPassword({ hash, password: 'wrong-password' })).toBe(false)
})
