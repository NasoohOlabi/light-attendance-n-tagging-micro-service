import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import { Auth } from '../auth'
import { renderBot } from '../menu'
import { Storage } from '../storage'
import { Mcp } from '../transport'
import type { Action, Screen } from '../types'
import type { telegramApi } from './telegram'

const secret = () => randomBytes(18).toString('base64url')

export function createNavigation(
  store: Storage,
  auth: Auth,
  api: ReturnType<typeof telegramApi>,
  origin: string,
) {
  const language = (chat: string): 'en' | 'ar' => (store.get(`lang:${chat}`) === 'ar' ? 'ar' : 'en')
  const say = async (chat: string, text: string) => {
    await api('sendMessage', { chat_id: chat, text })
  }
  const show = async (
    chat: string,
    user: number,
    action: Action,
    input?: string,
    messageId?: number,
  ) => {
    let lang = language(chat)
    if (action.route === 'sys.language') {
      lang = lang === 'en' ? 'ar' : 'en'
      store.set(`lang:${chat}`, lang)
      action = { route: 'home' }
    }
    if (action.route === 'sys.unlink') {
      await auth.unlink(chat)
      store.delete(`generation:${chat}`)
      store.delete(`prompt:${chat}`)
      await say(chat, lang === 'ar' ? 'تم إلغاء الربط.' : 'Account unlinked.')
      return
    }
    if (action.route === 'sys.home') action = { route: 'home' }
    const credentials = await auth.credentials(chat)
    if (!credentials) {
      store.delete(`prompt:${chat}`)
      store.delete(`generation:${chat}`)
      const showPending = async () => {
        await say(
          chat,
          lang === 'ar'
            ? 'أرسل الرمز المكوّن من ٨ أرقام المعروض في المتصفح هنا. للبدء من جديد، استخدم /cancel ثم /start.'
            : 'Send the eight-digit code shown in your browser here. To start again, use /cancel then /start.',
        )
      }
      if (auth.hasPendingCode(chat)) {
        await showPending()
        return
      }
      if (auth.isExchanging(chat)) {
        await say(
          chat,
          lang === 'ar'
            ? 'جارٍ إكمال الربط. انتظر رمز المتصفح، أو استخدم /cancel ثم /start للمحاولة من جديد.'
            : 'Linking is in progress. Wait for the browser code, or use /cancel then /start to try again.',
        )
        return
      }
      let url: string
      try {
        url = await auth.begin(chat)
      } catch (error) {
        if (auth.hasPendingCode(chat)) {
          await showPending()
          return
        }
        throw error
      }
      await api('sendMessage', {
        chat_id: chat,
        text:
          lang === 'ar'
            ? 'مرحباً بك في وارتق. افتح الرابط وسجّل الدخول، ثم أرسل الرمز المعروض هنا.'
            : 'Welcome to Wartaq. Open the link and sign in, then send the displayed code here.',
        reply_markup: {
          inline_keyboard: [[{ text: lang === 'ar' ? 'ربط الحساب' : 'Link account', url }]],
        },
      })
      return
    }
    const mcp = new Mcp(origin, credentials.access_token)
    let tools: ReadonlySet<string>
    try {
      tools = await mcp.tools()
    } catch (error) {
      if (error instanceof Error && error.message === 'MCP request failed (401)')
        await auth.unlink(chat)
      throw error
    }
    const screen: Screen = await renderBot({
      lang,
      route: action.route,
      args: action.args ?? {},
      input,
      tools,
      call: async (name, args) => {
        try {
          return await mcp.call(name, args)
        } catch (error) {
          if (error instanceof Error && error.message === 'MCP request failed (401)')
            await auth.unlink(chat)
          throw error
        }
      },
      website: origin,
    })
    const generation = secret()
    store.set(`generation:${chat}`, generation)
    const entries: { id: string; action: Action }[] = []
    const keyboard = screen.rows.map((row) =>
      row.map((button) => {
        if ('url' in button) return { text: button.label, url: button.url }
        const id = secret()
        entries.push({ id, action: button.action })
        return { text: button.label, callback_data: id }
      }),
    )
    const sent = z.object({ message_id: z.number() }).parse(
      await api(messageId ? 'editMessageText' : 'sendMessage', {
        chat_id: chat,
        ...(messageId ? { message_id: messageId } : {}),
        text: screen.text,
        reply_markup: { inline_keyboard: keyboard },
      }),
    )
    for (const entry of entries)
      store.set(
        `button:${entry.id}`,
        { chat, user, message: sent.message_id, generation, action: entry.action },
        Date.now() + 15 * 60_000,
      )
    if (screen.prompt)
      store.set(
        `prompt:${chat}`,
        { user, generation, action: screen.prompt },
        Date.now() + 15 * 60_000,
      )
    else store.delete(`prompt:${chat}`)
    if (screen.document) await api.document(chat, screen.document)
  }
  return { language, say, show }
}
