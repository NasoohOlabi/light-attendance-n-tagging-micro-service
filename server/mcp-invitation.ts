import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import type { PoolClient } from 'pg'
import { invitationResponseSchema } from '../shared/invitations'

export function invitationReceipts(secret: string) {
  const key = createHash('sha256').update('wartaq:invite-message:v1\0').update(secret).digest()
  const identifier = (requestId: string, subject: string) =>
    `wartaq:invite-message:${requestId}:${subject}`
  const aad = (subject: string, requestId: string) =>
    Buffer.from(JSON.stringify([subject, requestId]))
  return {
    async save(db: PoolClient, subject: string, requestId: string, value: unknown) {
      const iv = randomBytes(12)
      const cipher = createCipheriv('aes-256-gcm', key, iv)
      cipher.setAAD(aad(subject, requestId))
      const ciphertext = Buffer.concat([
        cipher.update(JSON.stringify(invitationResponseSchema.parse(value))),
        cipher.final(),
      ])
      const encrypted = Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64url')
      await db.query(
        `DELETE FROM neon_auth.verification WHERE identifier LIKE 'wartaq:invite-message:%' AND "expiresAt" <= now()`,
      )
      await db.query(
        `INSERT INTO neon_auth.verification (id, identifier, value, "expiresAt") VALUES (gen_random_uuid(), $1, $2, now() + interval '15 minutes')`,
        [identifier(requestId, subject), encrypted],
      )
    },
    async reveal(db: PoolClient, subject: string, requestId: string) {
      const result = await db.query(
        `DELETE FROM neon_auth.verification WHERE identifier = $1 AND "expiresAt" > now() RETURNING value`,
        [identifier(requestId, subject)],
      )
      if (!result.rowCount) return null
      const bytes = Buffer.from(result.rows[0].value, 'base64url')
      const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12))
      decipher.setAuthTag(bytes.subarray(12, 28))
      decipher.setAAD(aad(subject, requestId))
      return invitationResponseSchema.parse(
        JSON.parse(
          Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString(),
        ),
      )
    },
  }
}
