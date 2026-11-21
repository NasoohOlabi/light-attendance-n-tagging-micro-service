import { z } from 'zod'
import { payloadSchema } from '../../shared/ledger'
import type { BotContext, Screen, Action, Button } from '../types'

export const pageSize = 8
export const dateSchema = z.iso.date()
export const idSchema = z.uuid()
export const t = (ctx: BotContext, en: string, ar: string) => (ctx.lang === 'ar' ? ar : en)
export const button = (
  label: string,
  route: Action['route'],
  args: Record<string, string> = {},
): Button => ({
  label: label.slice(0, 60),
  action: { route, args },
})
export const home = (ctx: BotContext) => button(t(ctx, 'Home', 'الرئيسية'), 'home')
export const back = (ctx: BotContext, route: Action['route'], args: Record<string, string> = {}) =>
  button(t(ctx, 'Back', 'رجوع'), route, args)
export const short = (value: string, length = 200) =>
  value.length > length ? `${value.slice(0, length)}…` : value
export const today = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Damascus',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
export const page = (value: string | undefined) =>
  Math.max(0, Math.min(100000, Number.parseInt(value ?? '0', 10) || 0))
export const pagination = (
  ctx: BotContext,
  route: Action['route'],
  args: Record<string, string>,
  index: number,
  count: number,
): Button[][] => {
  const row: Button[] = []
  if (index > 0)
    row.push(button(t(ctx, 'Previous', 'السابق'), route, { ...args, page: String(index - 1) }))
  if ((index + 1) * pageSize < count)
    row.push(button(t(ctx, 'Next', 'التالي'), route, { ...args, page: String(index + 1) }))
  return row.length ? [row] : []
}
export const prompt = (
  ctx: BotContext,
  text: string,
  action: Action,
  backRoute: Action['route'],
  args: Record<string, string> = {},
): Screen => ({ text, prompt: action, rows: [[back(ctx, backRoute, args), home(ctx)]] })
export const unavailable = (ctx: BotContext): Screen => ({
  text: t(ctx, 'This action is unavailable.', 'هذا الإجراء غير متاح.'),
  rows: [[home(ctx)]],
})
export const event = (payload: unknown, args: Record<string, string>) => ({
  id: idSchema.parse(args.eventId),
  clientTime: z.iso.datetime().parse(args.time),
  payload: payloadSchema.parse(payload),
})
export const fresh = () => ({ eventId: crypto.randomUUID(), time: new Date().toISOString() })
