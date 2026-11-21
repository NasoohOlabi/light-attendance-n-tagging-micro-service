import { z } from 'zod'

export function telegramApi(token: string) {
  const api = async (method: string, body: Record<string, unknown>) => {
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(
        method === 'sendMessage'
          ? { ...body, protect_content: true, link_preview_options: { is_disabled: true } }
          : method === 'editMessageText'
            ? { ...body, link_preview_options: { is_disabled: true } }
            : body,
      ),
      signal: AbortSignal.timeout(method === 'getUpdates' ? 40_000 : 15_000),
      redirect: 'error',
    })
    if (!response.ok) throw new Error(`Telegram request failed (${response.status})`)
    const data = z.object({ ok: z.literal(true), result: z.unknown() }).parse(await response.json())
    return data.result
  }
  const document = async (chat: string, file: { name: string; bytes: Uint8Array }) => {
    const form = new FormData()
    form.set('chat_id', chat)
    form.set('protect_content', 'true')
    form.set('document', new Blob([Uint8Array.from(file.bytes)]), file.name)
    const response = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(15_000),
      redirect: 'error',
    })
    if (!response.ok) throw new Error('Telegram document delivery failed')
  }
  return Object.assign(api, { document })
}
