import { z } from 'zod'
import { Auth } from '../auth'
import { isBotRoute, type BotRoute } from '../routes'
import { Storage } from '../storage'
import type { createNavigation } from './navigation'
import type { telegramApi } from './telegram'

const updateSchema = z.object({
  update_id: z.number().int(),
  message: z
    .object({
      message_id: z.number(),
      chat: z.object({ id: z.number(), type: z.string() }),
      from: z.object({ id: z.number(), language_code: z.string().optional() }).optional(),
      text: z.string().optional(),
    })
    .optional(),
  callback_query: z
    .object({
      id: z.string(),
      from: z.object({ id: z.number() }),
      data: z.string().optional(),
      message: z
        .object({ message_id: z.number(), chat: z.object({ id: z.number(), type: z.string() }) })
        .optional(),
    })
    .optional(),
})
const actionSchema = z.object({
  route: z.custom<BotRoute>(isBotRoute),
  args: z.record(z.string(), z.string()).optional(),
})
const choiceSchema = z.object({
  chat: z.string(),
  user: z.number(),
  message: z.number(),
  generation: z.string(),
  action: actionSchema,
})
export function createUpdates(
  store: Storage,
  auth: Auth,
  api: ReturnType<typeof telegramApi>,
  navigation: ReturnType<typeof createNavigation>,
) {
  const { language, say, show } = navigation
  const process = async (raw: unknown) => {
    const update = updateSchema.parse(raw)
    const previous = z.number().nullable().parse(store.get('offset')) ?? 0
    if (update.update_id < previous) return
    // Mark before handling: a crash or uncertain response must never replay a mutation.
    store.set('offset', update.update_id + 1, Date.now() + 6 * 24 * 60 * 60_000)
    const callback = update.callback_query
    if (callback) {
      await api('answerCallbackQuery', { callback_query_id: callback.id }).catch(() => {})
      const message = callback.message
      if (
        !message ||
        message.chat.type !== 'private' ||
        message.chat.id !== callback.from.id ||
        !callback.data
      )
        return
      const chat = String(message.chat.id)
      const key = `button:${callback.data}`
      const parsedChoice = choiceSchema.safeParse(store.get(key))
      const choice = parsedChoice.success ? parsedChoice.data : null
      if (
        !choice ||
        choice.chat !== chat ||
        choice.user !== callback.from.id ||
        choice.message !== message.message_id ||
        store.get(`generation:${chat}`) !== choice.generation
      ) {
        await say(
          chat,
          language(chat) === 'ar'
            ? 'انتهت صلاحية هذا الخيار. استخدم /menu.'
            : 'This choice has expired. Use /menu.',
        )
        return
      }
      store.delete(key)
      store.delete(`generation:${chat}`)
      store.delete(`prompt:${chat}`)
      await show(chat, callback.from.id, choice.action, undefined, message.message_id)
      return
    }
    const message = update.message
    if (
      !message ||
      message.chat.type !== 'private' ||
      !message.from ||
      message.chat.id !== message.from.id ||
      !message.text
    )
      return
    const chat = String(message.chat.id)
    const text = message.text.trim()
    if (store.get(`lang:${chat}`) === null && message.from.language_code?.startsWith('ar'))
      store.set(`lang:${chat}`, 'ar')
    if (/^\d{8}$/.test(text) && auth.redeem(chat, text)) {
      await show(chat, message.from.id, { route: 'home' })
      return
    }
    if (/^\d{8}$/.test(text) && store.get(`link:${chat}`)) {
      await say(
        chat,
        language(chat) === 'ar'
          ? 'الرمز غير صحيح أو انتهت صلاحيته.'
          : 'That code is incorrect or expired.',
      )
      return
    }
    const command = text.split(/\s/)[0].split('@')[0]
    if (command === '/unlink') {
      await show(chat, message.from.id, { route: 'sys.unlink' })
      return
    }
    if (command === '/language') {
      await show(chat, message.from.id, { route: 'sys.language' })
      return
    }
    if (command === '/cancel') {
      auth.cancel(chat)
      store.delete(`prompt:${chat}`)
      store.delete(`generation:${chat}`)
      await say(
        chat,
        language(chat) === 'ar'
          ? 'تم الإلغاء. استخدم /menu لفتح القائمة.'
          : 'Cancelled. Use /menu to open the menu.',
      )
      return
    }
    if (command === '/help') {
      await say(
        chat,
        language(chat) === 'ar'
          ? '/menu القائمة، /cancel إلغاء، /language اللغة، /unlink إلغاء الربط'
          : '/menu opens the menu, /cancel cancels, /language changes language, /unlink disconnects.',
      )
      return
    }
    if (command === '/start' || command === '/menu') {
      store.delete(`prompt:${chat}`)
      await show(chat, message.from.id, { route: 'home' })
      return
    }
    const parsedPrompt = z
      .object({ user: z.number(), generation: z.string(), action: actionSchema })
      .safeParse(store.get(`prompt:${chat}`))
    const prompt = parsedPrompt.success ? parsedPrompt.data : null
    if (
      !text.startsWith('/') &&
      prompt?.user === message.from.id &&
      store.get(`generation:${chat}`) === prompt.generation
    ) {
      store.delete(`generation:${chat}`)
      store.delete(`prompt:${chat}`)
      await show(chat, message.from.id, prompt.action, text)
      return
    }
    await say(
      chat,
      language(chat) === 'ar' ? 'استخدم /menu لفتح القائمة.' : 'Use /menu to open the menu.',
    )
  }
  const notifyFailure = async (update: unknown) => {
    const parsed = updateSchema.safeParse(update)
    if (parsed.success) {
      const message = parsed.data.message ?? parsed.data.callback_query?.message
      const user = parsed.data.message?.from ?? parsed.data.callback_query?.from
      if (message?.chat.type === 'private' && user?.id === message.chat.id) {
        const chat = String(message.chat.id)
        await say(
          chat,
          language(chat) === 'ar'
            ? 'تعذر إكمال الطلب. تحقق من النتيجة قبل المحاولة مجدداً، أو استخدم /menu.'
            : 'The request could not be completed. Check the result before trying again, or use /menu.',
        ).catch(() => {})
      }
    }
  }
  return { process, notifyFailure }
}
