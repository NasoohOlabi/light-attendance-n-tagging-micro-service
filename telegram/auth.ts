import { createHash, randomBytes, randomInt } from 'node:crypto'
import { z } from 'zod'
import { Storage } from './storage'

const providerSchema = z.object({
  authorization_endpoint: z.url(),
  token_endpoint: z.url(),
  registration_endpoint: z.url(),
  revocation_endpoint: z.url().optional(),
})
const grantSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_in: z.number().positive().optional(),
})
const pendingSchema = z.object({ chat: z.string(), verifier: z.string(), client: z.string() })
const credentialsSchema = grantSchema.extend({ client: z.string(), expires: z.number() })
export type Credentials = z.infer<typeof credentialsSchema>
const nonce = () => randomBytes(32).toString('base64url')

export class Auth {
  private resource: string
  private redirect: string
  private registration?: Promise<string>
  constructor(
    private store: Storage,
    private origin: string,
    publicOrigin: string,
  ) {
    this.resource = `${origin}/mcp`
    this.redirect = `${publicOrigin}/callback`
  }
  private async provider(signal = AbortSignal.timeout(15_000)) {
    const protectedResponse = await fetch(
      `${this.origin}/.well-known/oauth-protected-resource/mcp`,
      { redirect: 'error', signal },
    )
    if (!protectedResponse.ok) throw new Error('OAuth discovery failed')
    const metadata = z
      .object({ resource: z.string(), authorization_servers: z.array(z.string()).min(1) })
      .parse(await protectedResponse.json())
    if (metadata.resource !== this.resource) throw new Error('Unexpected OAuth resource')
    const issuer = new URL(metadata.authorization_servers[0])
    if (issuer.origin !== this.origin) throw new Error('Unexpected OAuth issuer')
    const response = await fetch(
      `${issuer.origin}/.well-known/oauth-authorization-server${issuer.pathname === '/' ? '' : issuer.pathname}`,
      { redirect: 'error', signal },
    )
    if (!response.ok) throw new Error('OAuth discovery failed')
    const provider = providerSchema.extend({ issuer: z.string() }).parse(await response.json())
    if (provider.issuer !== issuer.href.replace(/\/$/, ''))
      throw new Error('Unexpected OAuth issuer')
    for (const endpoint of [
      provider.authorization_endpoint,
      provider.token_endpoint,
      provider.registration_endpoint,
      ...(provider.revocation_endpoint ? [provider.revocation_endpoint] : []),
    ]) {
      if (new URL(endpoint).origin !== this.origin) throw new Error('Unexpected OAuth endpoint')
    }
    return provider
  }
  private async client(provider: z.infer<typeof providerSchema> & { issuer: string }) {
    const key = `client:${createHash('sha256').update(`${provider.issuer} ${this.redirect}`).digest('hex')}`
    const saved = z.string().nullable().parse(this.store.get(key))
    if (saved) return saved
    if (!this.registration)
      this.registration = (async () => {
        const response = await fetch(provider.registration_endpoint, {
          method: 'POST',
          redirect: 'error',
          signal: AbortSignal.timeout(15_000),
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            client_name: 'Wartaq Telegram',
            redirect_uris: [this.redirect],
            token_endpoint_auth_method: 'none',
            grant_types: ['authorization_code', 'refresh_token'],
          }),
        })
        if (!response.ok) throw new Error('OAuth registration failed')
        const { client_id: client } = z
          .object({ client_id: z.string().min(1) })
          .parse(await response.json())
        this.store.set(key, client)
        return client
      })().finally(() => {
        this.registration = undefined
      })
    return this.registration
  }
  async begin(chat: string) {
    this.cancel(chat)
    const provider = await this.provider()
    const client = await this.client(provider)
    const verifier = nonce()
    const state = nonce()
    this.store.set(`oauth-active:${chat}`, state, Date.now() + 10 * 60_000)
    this.store.set(`oauth:${state}`, { chat, verifier, client }, Date.now() + 10 * 60_000)
    const url = new URL(provider.authorization_endpoint)
    url.search = new URLSearchParams({
      response_type: 'code',
      client_id: client,
      redirect_uri: this.redirect,
      resource: this.resource,
      scope: 'mcp:read mcp:write offline_access',
      state,
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
    }).toString()
    return url.toString()
  }
  async callback(url: URL) {
    const state = url.searchParams.get('state') ?? ''
    const code = url.searchParams.get('code') ?? ''
    if (!/^[A-Za-z0-9_-]{43}$/.test(state) || !code) throw new Error('Invalid callback')
    const pending = pendingSchema.parse(this.store.get(`oauth:${state}`))
    this.store.delete(`oauth:${state}`)
    if (this.store.get(`oauth-active:${pending.chat}`) !== state) throw new Error('Link cancelled')
    const provider = await this.provider()
    const response = await fetch(provider.token_endpoint, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: pending.client,
        code_verifier: pending.verifier,
        redirect_uri: this.redirect,
        resource: this.resource,
      }),
    })
    if (!response.ok) throw new Error('OAuth exchange failed')
    const grant = grantSchema.parse(await response.json())
    if (this.store.get(`oauth-active:${pending.chat}`) !== state) throw new Error('Link cancelled')
    this.store.delete(`oauth-active:${pending.chat}`)
    const challenge = String(randomInt(10000000, 100000000))
    this.store.set(
      `link:${pending.chat}`,
      {
        challenge,
        credentials: {
          ...grant,
          client: pending.client,
          expires: Date.now() + (grant.expires_in ?? 3600) * 1000,
        },
      },
      Date.now() + 5 * 60_000,
    )
    return challenge
  }
  redeem(chat: string, challenge: string) {
    const pending = z
      .object({ challenge: z.string(), credentials: credentialsSchema })
      .nullable()
      .parse(this.store.get(`link:${chat}`))
    if (!pending) return false
    if (pending.challenge !== challenge) {
      const attempts =
        z
          .number()
          .nullable()
          .parse(this.store.get(`attempts:${chat}`)) ?? 0
      this.store.set(`attempts:${chat}`, attempts + 1, Date.now() + 5 * 60_000)
      if (attempts >= 4) this.store.delete(`link:${chat}`)
      return false
    }
    this.store.delete(`attempts:${chat}`)
    this.store.delete(`link:${chat}`)
    this.store.set(`credentials:${chat}`, pending.credentials)
    return true
  }
  cancel(chat: string) {
    this.store.delete(`attempts:${chat}`)
    this.store.delete(`oauth-active:${chat}`)
    this.store.delete(`link:${chat}`)
  }
  async unlink(chat: string) {
    const credentials = credentialsSchema.nullable().parse(this.store.get(`credentials:${chat}`))
    const pending = z
      .object({ credentials: credentialsSchema })
      .nullable()
      .parse(this.store.get(`link:${chat}`))
    this.cancel(chat)
    this.store.delete(`credentials:${chat}`)
    const grant = credentials ?? pending?.credentials
    if (!grant) return
    try {
      const signal = AbortSignal.timeout(5_000)
      const provider = await this.provider(signal)
      if (!provider.revocation_endpoint) return
      const endpoint = provider.revocation_endpoint
      await Promise.allSettled(
        [grant.access_token, grant.refresh_token].map((token) =>
          fetch(endpoint, {
            method: 'POST',
            redirect: 'error',
            signal,
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ token, client_id: grant.client }),
          }),
        ),
      )
    } catch {
      // Local removal is authoritative even if the provider is unavailable.
    }
  }
  async credentials(chat: string): Promise<Credentials | null> {
    const credentials = credentialsSchema.nullable().parse(this.store.get(`credentials:${chat}`))
    if (!credentials || credentials.expires > Date.now() + 60_000) return credentials
    const provider = await this.provider()
    // Rotating refresh tokens must not be replayed after an uncertain response.
    this.store.delete(`credentials:${chat}`)
    const response = await fetch(provider.token_endpoint, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: credentials.refresh_token,
        client_id: credentials.client,
        resource: this.resource,
        scope: 'mcp:read mcp:write offline_access',
      }),
    })
    if (!response.ok) {
      if (response.status === 400 || response.status === 401) await this.unlink(chat)
      throw new Error('OAuth refresh failed')
    }
    const grant = grantSchema.parse(await response.json())
    const next = {
      ...grant,
      client: credentials.client,
      expires: Date.now() + (grant.expires_in ?? 3600) * 1000,
    }
    this.store.set(`credentials:${chat}`, next)
    return next
  }
}
