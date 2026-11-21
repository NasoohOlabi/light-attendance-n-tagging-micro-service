import { Database } from 'bun:sqlite'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { z } from 'zod'

export class Storage {
  private db: Database
  private key: Buffer

  constructor(path: string, key: string) {
    this.key = Buffer.from(key, 'base64')
    if (this.key.length !== 32)
      throw new Error('TELEGRAM_STORAGE_KEY must be a base64-encoded 32-byte key')
    this.db = new Database(path, { create: true })
    this.db.exec(
      'PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS state (key TEXT PRIMARY KEY, value TEXT NOT NULL, expires INTEGER NOT NULL)',
    )
  }

  set(key: string, value: unknown, expires = 0) {
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', this.key, iv)
    cipher.setAAD(Buffer.from(key))
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()])
    const encoded = Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64')
    this.db.query('INSERT OR REPLACE INTO state VALUES (?, ?, ?)').run(key, encoded, expires)
  }

  get(key: string): unknown {
    const row = z
      .object({ value: z.string(), expires: z.number() })
      .nullable()
      .parse(this.db.query('SELECT value, expires FROM state WHERE key = ?').get(key))
    if (!row) return null
    if (row.expires && row.expires <= Date.now()) {
      this.delete(key)
      return null
    }
    const data = Buffer.from(row.value, 'base64')
    const decipher = createDecipheriv('aes-256-gcm', this.key, data.subarray(0, 12))
    decipher.setAAD(Buffer.from(key))
    decipher.setAuthTag(data.subarray(12, 28))
    return JSON.parse(
      Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString('utf8'),
    )
  }

  prune() {
    this.db.query('DELETE FROM state WHERE expires > 0 AND expires <= ?').run(Date.now())
  }

  delete(key: string) {
    this.db.query('DELETE FROM state WHERE key = ?').run(key)
  }
  close() {
    this.db.close()
  }
}
