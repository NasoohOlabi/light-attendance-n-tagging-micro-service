import type { Auth } from '../auth'
import { linkPage, linkPageScriptHash, linkPageStyleHash } from './linkPage'

export function createHttp(auth: Pick<Auth, 'callback'>, isReady: () => boolean) {
  return async (request: Request) => {
    const url = new URL(request.url)
    if (url.pathname === '/health')
      return new Response(isReady() ? 'ok' : 'unavailable', { status: isReady() ? 200 : 503 })
    if (url.pathname !== '/callback' || request.method !== 'GET')
      return new Response('Not found', { status: 404 })
    try {
      const code = await auth.callback(url)
      return new Response(linkPage(code), {
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store',
          'referrer-policy': 'no-referrer',
          'content-security-policy': `default-src 'none'; style-src 'sha256-${linkPageStyleHash}'; script-src 'sha256-${linkPageScriptHash}'; frame-ancestors 'none'`,
          'x-content-type-options': 'nosniff',
        },
      })
    } catch {
      return new Response('Link expired or failed. Start again in your private chat.', {
        status: 400,
        headers: { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' },
      })
    }
  }
}
