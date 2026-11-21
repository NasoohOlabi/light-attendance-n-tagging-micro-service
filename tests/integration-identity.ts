import { hashPassword } from 'better-auth/crypto'
import type { Pool } from 'pg'

export async function createIdentity(pool: Pool, name: string, password: string) {
  const id = crypto.randomUUID()
  await pool.query(
    'INSERT INTO neon_auth."user" (id, name, email, "emailVerified") VALUES ($1, $2, $3, true)',
    [id, name, `${id}@invitation.invalid`],
  )
  await pool.query(
    `INSERT INTO neon_auth.account (id, "accountId", "providerId", "userId", password) VALUES ($1, $2::text, 'credential', $2::text::uuid, $3)`,
    [crypto.randomUUID(), id, await hashPassword(password)],
  )
  return id
}
