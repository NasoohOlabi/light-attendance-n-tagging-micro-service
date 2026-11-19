import { randomBytes } from 'node:crypto'
import { z } from 'zod'

export async function startIntegrationServer(databaseUrl: string) {
  const ready = Promise.withResolvers<unknown>()
  const child = Bun.spawn([process.execPath, 'run', import.meta.path], {
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
    },
    stdout: 'ignore',
    stderr: 'inherit',
    ipc: ready.resolve,
  })
  const deadline = AbortSignal.timeout(10000)
  deadline.addEventListener('abort', () => ready.reject(deadline.reason), { once: true })

  try {
    const address = await Promise.race([
      ready.promise,
      child.exited.then((code) => {
        throw new Error(`Integration server exited before startup with code ${code}`)
      }),
    ])
    const origin = z
      .string()
      .regex(/^http:\/\/127\.0\.0\.1:\d+$/)
      .parse(address)
    const response = await fetch(`${origin}/health`, { signal: deadline })
    if (!response.ok) throw new Error(`Integration server health check returned ${response.status}`)
    return { origin, child }
  } catch (error) {
    child.kill()
    throw error
  }
}

if (import.meta.main) {
  const handler = Promise.withResolvers<typeof import('../server/index').handle>()
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: async (request) => (await handler.promise)(request),
  })
  process.env.PORT = String(server.port)
  process.env.BETTER_AUTH_URL = server.url.origin
  handler.resolve((await import('../server/index')).handle)
  process.send?.(server.url.origin)
}
