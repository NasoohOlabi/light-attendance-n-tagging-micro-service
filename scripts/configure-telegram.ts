import { z } from 'zod'

const token = process.env.TELEGRAM_BOT_TOKEN
if (!token) throw new Error('Set TELEGRAM_BOT_TOKEN in the private environment.')

const commands = [
  ['menu', 'Open my notebook', 'فتح دفتري'],
  ['cancel', 'Cancel the current action', 'إلغاء الإجراء الحالي'],
  ['language', 'Switch between English and Arabic', 'تبديل اللغة بين العربية والإنجليزية'],
  ['help', 'Show help', 'عرض المساعدة'],
  ['unlink', 'Disconnect my Wartaq account', 'فصل حسابي في وارتق'],
]
const responseSchema = z.object({ ok: z.literal(true) })
async function configure(method: string, input: Record<string, unknown>) {
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(15_000),
      redirect: 'error',
    })
    if (response.ok && responseSchema.safeParse(await response.json()).success) return
  } catch {
    // Telegram endpoints include the credential. Surface the operation name only.
  }
  throw new Error(`Telegram could not apply ${method}.`)
}

for (const lang of ['', 'ar']) {
  const ar = lang === 'ar'
  await configure('setMyCommands', {
    language_code: lang,
    scope: { type: 'all_private_chats' },
    commands: commands.map(([command, en, arabic]) => ({ command, description: ar ? arabic : en })),
  })
  await configure('setMyShortDescription', {
    language_code: lang,
    short_description: ar
      ? 'دفتر وارتق للحضور والطلاب والدورات.'
      : 'Your Wartaq notebook for attendance, students and courses.',
  })
  await configure('setMyDescription', {
    language_code: lang,
    description: ar
      ? 'اضغط على بدء واربط حسابك في وارتق. سجّل الحضور، وابحث عن طالب، وافتح دوراتك من الأزرار داخل المحادثة. يرى الطالب سجل حضوره فقط.'
      : 'Tap Start to link your Wartaq account. Take attendance, find a student or open a course using the buttons in this chat. Students can check their own attendance.',
  })
}
await configure('setChatMenuButton', { menu_button: { type: 'commands' } })
