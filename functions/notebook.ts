import { Pool } from 'pg'
import { attachDatabasePool } from '@neon/functions'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { z } from 'zod'
import { createHandler } from './notebook-service'

const parsed = z
  .object({
    DATABASE_URL: z.string().min(1),
    NEON_AUTH_JWKS_URL: z.url(),
    NEON_AUTH_BASE_URL: z.url(),
    APP_ORIGINS: z.string().min(1),
  })
  .safeParse(process.env)
if (!parsed.success) throw new Error('Notebook server configuration is incomplete.')
const environment = parsed.data
const pool = new Pool({
  connectionString: environment.DATABASE_URL,
  max: 5,
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
  statement_timeout: 15000,
  query_timeout: 20000,
})
attachDatabasePool(pool)
const jwks = createRemoteJWKSet(new URL(environment.NEON_AUTH_JWKS_URL))
const issuer = new URL(environment.NEON_AUTH_BASE_URL).origin
const fetch = createHandler(
  pool,
  async (token) => {
    const { payload } = await jwtVerify(token, jwks, {
      issuer,
      algorithms: ['EdDSA'],
      requiredClaims: ['sub', 'exp'],
    })
    if (!payload.sub) throw new Error('Missing subject')
    return payload.sub
  },
  environment.APP_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
)
export default { fetch }
