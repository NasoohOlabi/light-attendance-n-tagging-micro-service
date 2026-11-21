import { Auth } from '../auth'

export function createHttp(auth: Auth, isReady: () => boolean) {
  return async (request: Request) => {
    const url = new URL(request.url)
    if (url.pathname === '/health')
      return new Response(isReady() ? 'ok' : 'unavailable', { status: isReady() ? 200 : 503 })
    if (url.pathname !== '/callback' || request.method !== 'GET')
      return new Response('Not found', { status: 404 })
    try {
      const code = await auth.callback(url)
      return new Response(
        `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="no-referrer"><title>Wartaq</title></head><body><main><h1>Connect Wartaq</h1><p>Return to your private Telegram chat and send this code. Do not share it with anyone else.</p><p><strong>${code}</strong></p><p><a href="https://t.me/WartaqBot">Open @WartaqBot</a></p><section lang="ar" dir="rtl"><h1>ربط وارتق</h1><p>ارجع إلى محادثتك الخاصة في تيليغرام وأرسل هذا الرمز. لا تشاركه مع أي شخص آخر.</p><p><strong dir="ltr">${code}</strong></p><p><a href="https://t.me/WartaqBot">افتح @WartaqBot</a></p></section></main></body></html>`,
        {
          headers: {
            'content-type': 'text/html; charset=utf-8',
            'cache-control': 'no-store',
            'referrer-policy': 'no-referrer',
            'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
            'x-content-type-options': 'nosniff',
          },
        },
      )
    } catch {
      return new Response('Link expired or failed. Start again in your private chat.', {
        status: 400,
        headers: { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' },
      })
    }
  }
}
