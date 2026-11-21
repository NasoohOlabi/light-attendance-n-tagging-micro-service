import type { BotContext, Screen } from './types'
import { courseContext } from './courses/context'
import { browse } from './courses/browse'
import { commit } from './courses/commit'
import { members } from './courses/members'
import { grades } from './courses/grades'
import { exports } from './courses/exports'

export const courseRoutes = [
  'co.commit',
  'co.list',
  'co.search',
  'co.name',
  'co.view',
  'co.status',
  'co.thresholds',
  'co.threshold',
  'co.members',
  'co.student',
  'co.membership',
  'co.level',
  'co.teacher',
  'co.teacher.pick',
  'co.handbook',
  'co.grades',
  'co.grade',
  'co.decision',
  'co.reason',
  'co.readiness',
  'co.reports',
  'co.report',
] as const

const workflows = {
  'co.commit': commit,
  'co.list': browse,
  'co.search': browse,
  'co.name': browse,
  'co.view': browse,
  'co.status': browse,
  'co.thresholds': browse,
  'co.threshold': browse,
  'co.members': members,
  'co.student': members,
  'co.membership': members,
  'co.level': members,
  'co.teacher': members,
  'co.teacher.pick': members,
  'co.handbook': members,
  'co.grades': grades,
  'co.grade': grades,
  'co.decision': grades,
  'co.reason': grades,
  'co.readiness': exports,
  'co.reports': exports,
  'co.report': exports,
} satisfies Record<(typeof courseRoutes)[number], typeof browse>

export async function courses(ctx: BotContext): Promise<Screen> {
  const route = courseRoutes.find((key): key is keyof typeof workflows => key === ctx.route)
  if (!route || !ctx.tools.has('get_notebook'))
    return {
      text:
        ctx.lang === 'ar'
          ? '\u0647\u0630\u0627 \u0627\u0644\u0625\u062c\u0631\u0627\u0621 \u063a\u064a\u0631 \u0645\u062a\u0627\u062d \u0644\u062d\u0633\u0627\u0628\u0643.'
          : 'This action is unavailable for your account.',
      rows: [
        [
          {
            label: ctx.lang === 'ar' ? '\u0627\u0644\u0631\u0626\u064a\u0633\u064a\u0629' : 'Home',
            action: { route: 'home' },
          },
        ],
      ],
    }
  const boardRoutes: readonly string[] = [
    'co.members',
    'co.student',
    'co.membership',
    'co.teacher',
    'co.teacher.pick',
  ]
  return workflows[route](await courseContext(ctx, boardRoutes.includes(route)))
}
