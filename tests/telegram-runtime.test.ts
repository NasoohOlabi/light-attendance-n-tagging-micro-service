import { afterEach, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { Auth } from '../telegram/auth'
import { Storage } from '../telegram/storage'

const originalFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = originalFetch
})

test('configuration errors do not expose secret values', async () => {
  const { createWorker } = await import('../telegram/runtime')
  try {
    createWorker({ TELEGRAM_BOT_TOKEN: 'synthetic-secret', PORT: 'invalid' })
    throw new Error('Expected invalid configuration to fail')
  } catch (error) {
    expect(String(error)).toContain('Invalid Telegram worker configuration')
    expect(String(error)).not.toContain('synthetic-secret')
  }
})

test('a code arriving during authorization discovery is not replaced', async () => {
  const store = new Storage(':memory:', Buffer.alloc(32, 7).toString('base64'))
  let release: (() => void) | undefined
  const waiting = new Promise<void>((resolve) => {
    release = resolve
  })
  globalThis.fetch = Object.assign(
    async (input: string | URL | Request) => {
      if (String(input).includes('oauth-protected-resource')) {
        await waiting
        return Response.json({
          resource: 'https://wartaq.example/mcp',
          authorization_servers: ['https://wartaq.example/api/auth'],
        })
      }
      return Response.json({
        issuer: 'https://wartaq.example/api/auth',
        authorization_endpoint: 'https://wartaq.example/authorize',
        token_endpoint: 'https://wartaq.example/token',
        registration_endpoint: 'https://wartaq.example/register',
      })
    },
    { preconnect: originalFetch.preconnect },
  )
  try {
    const auth = new Auth(store, 'https://wartaq.example', 'https://bot.example')
    const beginning = auth.begin('123')
    store.set('link:123', { challenge: 'synthetic pending' })
    release?.()
    await expect(beginning).rejects.toThrow('OAuth code ready')
    expect(store.get('link:123')).not.toBeNull()
    expect(store.get('oauth-active:123')).toBeNull()
  } finally {
    store.close()
  }
})

test('repeated navigation preserves browser authorization and the pending private code', async () => {
  const { createWorker } = await import('../telegram/runtime')
  const directory = mkdtempSync(join(tmpdir(), 'wartaq-link-'))
  const messages: Record<string, unknown>[] = []
  let tokenFails = false
  globalThis.fetch = Object.assign(
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {}
      if (url.endsWith('/.well-known/oauth-protected-resource/mcp'))
        return Response.json({
          resource: 'https://wartaq.example/mcp',
          authorization_servers: ['https://wartaq.example/api/auth'],
        })
      if (url.includes('/.well-known/oauth-authorization-server'))
        return Response.json({
          issuer: 'https://wartaq.example/api/auth',
          authorization_endpoint: 'https://wartaq.example/authorize',
          token_endpoint: 'https://wartaq.example/token',
          registration_endpoint: 'https://wartaq.example/register',
        })
      if (url.endsWith('/register')) return Response.json({ client_id: 'synthetic-client' })
      if (url.endsWith('/token') && tokenFails) return new Response(null, { status: 503 })
      if (url.endsWith('/token'))
        return Response.json({
          access_token: 'synthetic-access',
          refresh_token: 'synthetic-refresh',
          expires_in: 3600,
        })
      if (new URL(url).origin === 'https://api.telegram.org') {
        messages.push(body)
        return Response.json({ ok: true, result: { message_id: 10 } })
      }
      if (url.endsWith('/mcp'))
        return Response.json({
          jsonrpc: '2.0',
          id: body.id,
          result:
            body.method === 'tools/list'
              ? { tools: [{ name: 'get_account' }] }
              : {
                  content: [
                    {
                      type: 'text',
                      text: JSON.stringify({
                        account: {
                          id: '11111111-1111-4111-8111-111111111111',
                          role: 'teacher',
                          name: 'Synthetic',
                          canRead: true,
                          canWrite: true,
                          expiresAt: null,
                        },
                      }),
                    },
                  ],
                },
        })
      throw new Error('Unexpected request')
    },
    { preconnect: originalFetch.preconnect },
  )
  const worker = createWorker({
    TELEGRAM_BOT_TOKEN: 'synthetic',
    WARTAQI_ORIGIN: 'https://wartaq.example',
    TELEGRAM_PUBLIC_ORIGIN: 'https://bot.example',
    TELEGRAM_DB_PATH: join(directory, 'bot.sqlite'),
    TELEGRAM_STORAGE_KEY: Buffer.alloc(32, 7).toString('base64'),
  })
  const send = (update_id: number, text: string) =>
    worker.process({
      update_id,
      message: {
        message_id: update_id,
        chat: { id: 123, type: 'private' },
        from: { id: 123 },
        text,
      },
    })
  try {
    await send(1, '/start')
    const keyboard = z
      .object({ inline_keyboard: z.array(z.array(z.object({ url: z.string() }))) })
      .parse(messages.at(-1)?.reply_markup)
    const authorize = new URL(keyboard.inline_keyboard[0][0].url)
    await send(2, '/language')
    expect(String(messages.at(-1)?.text)).toContain('وارتق')
    await send(3, '/start')
    const callback = new URL('https://bot.example/callback')
    callback.searchParams.set('state', authorize.searchParams.get('state') ?? '')
    callback.searchParams.set('code', 'synthetic-code')
    const response = await worker.fetch(new Request(callback))
    expect(response.status).toBe(200)
    const code = z
      .string()
      .regex(/^\d{8}$/)
      .parse((await response.text()).match(/<strong>(\d{8})<\/strong>/)?.[1])
    await send(4, '/language')
    await send(5, '/start link')
    expect(String(messages.at(-1)?.text).toLowerCase()).toContain('code')
    await send(6, '00000000')
    expect(String(messages.at(-1)?.text)).toContain('/cancel')
    expect(worker.store.get('link:123')).not.toBeNull()
    await send(7, code)
    expect(worker.store.get('credentials:123')).not.toBeNull()
    expect(String(messages.at(-1)?.text)).toContain('Synthetic')
    await send(8, '/unlink')
    await send(9, '/start')
    const next = z
      .object({ inline_keyboard: z.array(z.array(z.object({ url: z.string() }))) })
      .parse(messages.at(-1)?.reply_markup)
    const nextState = new URL(next.inline_keyboard[0][0].url).searchParams.get('state') ?? ''
    await send(10, '/cancel')
    expect(worker.store.get(`oauth:${nextState}`)).toBeNull()
    await send(11, '/start')
    expect(worker.store.get('oauth-active:123')).not.toBe(nextState)
    const failingState = z.string().parse(worker.store.get('oauth-active:123'))
    const failingCallback = new URL('https://bot.example/callback')
    failingCallback.searchParams.set('state', failingState)
    failingCallback.searchParams.set('code', 'synthetic-code')
    tokenFails = true
    expect((await worker.fetch(new Request(failingCallback))).status).toBe(400)
    expect(worker.store.get('oauth-active:123')).toBeNull()
    tokenFails = false
    await send(12, '/start')
    expect(worker.store.get('oauth-active:123')).not.toBe(failingState)
  } finally {
    worker.store.close()
    rmSync(directory, { recursive: true, force: true })
  }
})

test('OAuth link requires a browser code in the original chat and persists encrypted credentials', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'wartaq-telegram-'))
  const path = join(directory, 'bot.sqlite')
  const key = Buffer.alloc(32, 7).toString('base64')
  const store = new Storage(path, key)
  const origin = 'https://wartaq.example'
  let registrations = 0
  const revoked: string[] = []
  let revokeFails = false
  globalThis.fetch = Object.assign(
    async (input: string | URL | Request) => {
      const url = String(input)
      if (url.endsWith('/.well-known/oauth-protected-resource/mcp'))
        return Response.json({
          resource: `${origin}/mcp`,
          authorization_servers: [`${origin}/api/auth`],
        })
      if (url.includes('/.well-known/oauth-authorization-server'))
        return Response.json({
          issuer: `${origin}/api/auth`,
          authorization_endpoint: `${origin}/authorize`,
          token_endpoint: `${origin}/token`,
          registration_endpoint: `${origin}/register`,
          revocation_endpoint: `${origin}/revoke`,
        })
      if (url.endsWith('/register')) {
        registrations++
        return Response.json({ client_id: 'synthetic-client' })
      }
      if (url.endsWith('/revoke')) {
        revoked.push(url)
        if (revokeFails) throw new Error('Synthetic outage')
        return new Response(null, { status: 200 })
      }
      if (url.endsWith('/token'))
        return Response.json({
          access_token: 'synthetic-access-secret',
          refresh_token: 'synthetic-refresh-secret',
          expires_in: 3600,
        })
      throw new Error('Unexpected request')
    },
    { preconnect: originalFetch.preconnect },
  )
  try {
    const auth = new Auth(store, origin, 'https://bot.example')
    const [first] = await Promise.all([auth.begin('123'), auth.begin('456')])
    const authorization = new URL(z.string().parse(first))
    expect(registrations).toBe(1)
    expect(authorization.searchParams.get('scope')).toBe('mcp:read mcp:write offline_access')
    expect(authorization.searchParams.get('code_challenge_method')).toBe('S256')
    const callback = new URL('https://bot.example/callback')
    callback.searchParams.set('state', authorization.searchParams.get('state') ?? '')
    callback.searchParams.set('code', 'synthetic-code')
    const { createWorker } = await import('../telegram/runtime')
    const worker = createWorker({
      TELEGRAM_BOT_TOKEN: 'synthetic',
      WARTAQI_ORIGIN: origin,
      TELEGRAM_PUBLIC_ORIGIN: 'https://bot.example',
      TELEGRAM_DB_PATH: path,
      TELEGRAM_STORAGE_KEY: key,
    })
    const landing = await worker.fetch(new Request(callback))
    expect(landing.status).toBe(200)
    expect(landing.headers.get('cache-control')).toBe('no-store')
    const html = await landing.text()
    expect(html).toContain('لا تشاركه')
    expect(html).toContain('name="viewport"')
    const code = z
      .string()
      .regex(/^\d{8}$/)
      .parse(html.match(/<strong>(\d{8})<\/strong>/)?.[1])
    worker.store.close()
    expect(auth.redeem('456', code)).toBe(false)
    expect(auth.redeem('123', code)).toBe(true)
    expect(auth.redeem('123', code)).toBe(false)
    await expect(auth.callback(callback)).rejects.toThrow()
    store.close()
    expect(readFileSync(path).includes(Buffer.from('synthetic-access-secret'))).toBe(false)
    const reopened = new Storage(path, key)
    expect(
      (await new Auth(reopened, origin, 'https://bot.example').credentials('123'))?.access_token,
    ).toBe('synthetic-access-secret')
    await new Auth(reopened, origin, 'https://bot.example').begin('789')
    expect(registrations).toBe(1)
    reopened.set('expired', 'secret', Date.now() - 1)
    reopened.prune()
    expect(reopened.get('expired')).toBeNull()
    await new Auth(reopened, origin, 'https://bot.example').unlink('123')
    expect(reopened.get('credentials:123')).toBeNull()
    expect(revoked).toHaveLength(2)
    reopened.set('credentials:123', {
      access_token: 'synthetic-access-secret',
      refresh_token: 'synthetic-refresh-secret',
      client: 'synthetic-client',
      expires: Date.now() + 60_000,
    })
    revokeFails = true
    await new Auth(reopened, origin, 'https://bot.example').unlink('123')
    expect(reopened.get('credentials:123')).toBeNull()
    reopened.close()
  } finally {
    try {
      store.close()
    } catch {
      /* Already closed. */
    }
    rmSync(directory, { recursive: true, force: true })
  }
})

test('private updates use bound, single-use choices and never replay a duplicate', async () => {
  const { createWorker } = await import('../telegram/runtime')
  const directory = mkdtempSync(join(tmpdir(), 'wartaq-updates-'))
  const deliveries: Record<string, unknown>[] = []
  let mcpCalls = 0
  let failMcp = false
  globalThis.fetch = Object.assign(
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {}
      if (url.endsWith('/.well-known/oauth-protected-resource/mcp'))
        return Response.json({
          resource: 'https://wartaq.example/mcp',
          authorization_servers: ['https://wartaq.example/api/auth'],
        })
      if (url.includes('/.well-known/oauth-authorization-server'))
        return Response.json({
          issuer: 'https://wartaq.example/api/auth',
          authorization_endpoint: 'https://wartaq.example/authorize',
          token_endpoint: 'https://wartaq.example/token',
          registration_endpoint: 'https://wartaq.example/register',
        })
      if (url.endsWith('/register')) return Response.json({ client_id: 'synthetic-client' })
      if (new URL(url).origin === 'https://api.telegram.org') {
        deliveries.push({ method: url.split('/').at(-1), ...body })
        return Response.json({ ok: true, result: { message_id: body.message_id ?? 10 } })
      }
      if (url.endsWith('/mcp')) {
        mcpCalls++
        if (failMcp) throw new Error('Synthetic uncertain delivery')
        const result =
          body.method === 'tools/list'
            ? { tools: [{ name: 'get_account' }] }
            : {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify({
                      account: {
                        id: '11111111-1111-4111-8111-111111111111',
                        role: 'teacher',
                        name: 'Synthetic',
                        canRead: true,
                        canWrite: true,
                        expiresAt: null,
                      },
                    }),
                  },
                ],
              }
        return Response.json({ jsonrpc: '2.0', id: body.id, result })
      }
      throw new Error('Unexpected request')
    },
    { preconnect: originalFetch.preconnect },
  )
  const worker = createWorker({
    TELEGRAM_BOT_TOKEN: 'synthetic',
    WARTAQI_ORIGIN: 'https://wartaq.example',
    TELEGRAM_PUBLIC_ORIGIN: 'https://bot.example',
    TELEGRAM_DB_PATH: join(directory, 'bot.sqlite'),
    TELEGRAM_STORAGE_KEY: Buffer.alloc(32, 7).toString('base64'),
  })
  const message = (update_id: number, text: string) => ({
    update_id,
    message: { message_id: update_id, chat: { id: 123, type: 'private' }, from: { id: 123 }, text },
  })
  try {
    expect((await worker.fetch(new Request('https://bot.example/health'))).status).toBe(503)
    await worker.process(message(1, '/start'))
    expect(mcpCalls).toBe(0)
    expect(deliveries.at(-1)?.protect_content).toBe(true)
    expect(JSON.stringify(deliveries.at(-1)?.reply_markup)).toContain(
      'https://wartaq.example/authorize',
    )
    worker.store.set('credentials:123', {
      access_token: 'synthetic',
      refresh_token: 'synthetic',
      client: 'synthetic',
      expires: Date.now() + 3600_000,
    })
    await worker.process(message(2, '/menu'))
    const sent = deliveries.at(-1)
    const rows = z
      .object({
        inline_keyboard: z.array(z.array(z.object({ callback_data: z.string().optional() }))),
      })
      .parse(sent?.reply_markup).inline_keyboard
    const data = rows.flat().find((button) => button.callback_data)?.callback_data
    expect(typeof data).toBe('string')
    const callback = (update_id: number, user: number) => ({
      update_id,
      callback_query: {
        id: `callback-${update_id}`,
        from: { id: user },
        data,
        message: { message_id: 10, chat: { id: 123, type: 'private' } },
      },
    })
    await worker.process(callback(3, 456))
    const before = mcpCalls
    await worker.process(callback(4, 123))
    expect(mcpCalls).toBeGreaterThan(before)
    expect(deliveries.some((delivery) => delivery.method === 'editMessageText')).toBe(true)
    const after = mcpCalls
    await worker.process(callback(4, 123))
    await worker.process(callback(5, 123))
    expect(mcpCalls).toBe(after)
    await worker.process(message(6, 'unsolicited'))
    expect(deliveries.at(-1)?.text).toContain('/menu')
    worker.store.set('generation:123', 'prompt-generation')
    worker.store.set('prompt:123', {
      user: 123,
      generation: 'prompt-generation',
      action: { route: 'home' },
    })
    worker.store.set('button:old', {
      chat: '123',
      user: 123,
      message: 10,
      generation: 'prompt-generation',
      action: { route: 'home' },
    })
    await worker.process(message(7, '/unknown'))
    expect(worker.store.get('generation:123')).toBe('prompt-generation')
    failMcp = true
    await expect(worker.process(message(8, 'ordinary input'))).rejects.toThrow()
    expect(worker.store.get('generation:123')).toBeNull()
    const afterFailedInput = mcpCalls
    await worker.process({
      update_id: 9,
      callback_query: {
        id: 'stale',
        from: { id: 123 },
        data: 'old',
        message: { message_id: 10, chat: { id: 123, type: 'private' } },
      },
    })
    expect(mcpCalls).toBe(afterFailedInput)
    worker.store.set('button:obsolete', {
      chat: '123',
      user: 123,
      message: 10,
      generation: 'old',
      action: { route: 'removed.route' },
    })
    await worker.process({
      update_id: 10,
      callback_query: {
        id: 'obsolete',
        from: { id: 123 },
        data: 'obsolete',
        message: { message_id: 10, chat: { id: 123, type: 'private' } },
      },
    })
    expect(mcpCalls).toBe(afterFailedInput)
    failMcp = false
    await worker.process(message(11, '/unlink'))
    expect(worker.store.get('credentials:123')).toBeNull()
    worker.store.set('offset', 999, Date.now() - 1)
    await worker.process(message(2, '/help'))
    expect(deliveries.at(-1)?.text).toContain('/cancel')
  } finally {
    worker.store.close()
    rmSync(directory, { recursive: true, force: true })
  }
})
