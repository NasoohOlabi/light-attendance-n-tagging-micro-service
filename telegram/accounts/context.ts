import type { BotContext, Button, Screen, Action } from '../types'

export function accountContext(ctx: BotContext) {
  const t = (en: string, ar: string) => (ctx.lang === 'ar' ? ar : en)
  const button = (
    label: string,
    route: Action['route'],
    args: Record<string, string> = {},
  ): Button => ({
    label: label.slice(0, 60),
    action: { route, args },
  })
  const back = (route: Action['route'], args: Record<string, string> = {}): Button[] => [
    button(t('Back', 'رجوع'), route, args),
    button(t('Home', 'الرئيسية'), 'home'),
  ]
  const site = (params: Record<string, string>) => {
    const url = new URL('/', ctx.website)
    url.search = new URLSearchParams({ page: 'app', ...params }).toString()
    return url.href
  }
  const denied = (): Screen => ({
    text: t('This action is unavailable for your account.', 'هذا الإجراء غير متاح لحسابك.'),
    rows: [back('home')],
  })
  const prompt = (
    text: string,
    route: Action['route'],
    args: Record<string, string>,
    cancel: Action['route'],
  ): Screen => ({ text, rows: [back(cancel, args)], prompt: { route, args } })
  return { ctx, t, button, back, site, denied, prompt }
}
export type AccountContext = ReturnType<typeof accountContext>
