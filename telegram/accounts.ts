import type { BotContext, Screen } from './types'
import { accountContext } from './accounts/context'
import { profile } from './accounts/profile'
import { browse } from './accounts/browse'
import { invite } from './accounts/invite'

export const accountRoutes = [
  'ac.profile',
  'ac.profile.name',
  'ac.profile.save',
  'ac.list',
  'ac.search',
  'ac.view',
  'ac.invite',
  'ac.invite.name',
  'ac.invite.phone',
  'ac.invite.send',
] as const

const workflows = {
  'ac.profile': profile,
  'ac.profile.name': profile,
  'ac.profile.save': profile,
  'ac.list': browse,
  'ac.search': browse,
  'ac.view': browse,
  'ac.invite': invite,
  'ac.invite.name': invite,
  'ac.invite.phone': invite,
  'ac.invite.send': invite,
} satisfies Record<(typeof accountRoutes)[number], typeof profile>

export async function accounts(ctx: BotContext): Promise<Screen> {
  const route = accountRoutes.find((key): key is keyof typeof workflows => key === ctx.route)
  const state = accountContext(ctx)
  return route ? workflows[route](state) : state.denied()
}
