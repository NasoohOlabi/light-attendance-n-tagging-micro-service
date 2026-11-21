import { neonSnapshotSchema } from '../shared/neon'
import type { BotContext, Screen } from './types'
import { attendanceRoutes, attendanceWorkflow, mineWorkflow } from './notebook/attendance'
import { historyRoutes, historyWorkflow } from './notebook/history'
import { insightRoutes, insightWorkflow } from './notebook/insights'
import { rosterRoutes, rosterWorkflow } from './notebook/roster'
import { unavailable } from './notebook/shared'

export const notebookRoutes = [
  ...rosterRoutes,
  ...attendanceRoutes,
  ...historyRoutes,
  ...insightRoutes,
] as const

export async function notebook(ctx: BotContext): Promise<Screen> {
  if (ctx.route === 'nb.mine') return mineWorkflow(ctx)
  if (insightRoutes.some((route) => route === ctx.route)) return insightWorkflow(ctx)
  if (!notebookRoutes.some((route) => route === ctx.route) || !ctx.tools.has('get_notebook'))
    return unavailable(ctx)
  const snapshot = neonSnapshotSchema.parse(await ctx.call('get_notebook'))
  if (rosterRoutes.some((route) => route === ctx.route)) return rosterWorkflow(ctx, snapshot)
  if (attendanceRoutes.some((route) => route === ctx.route))
    return attendanceWorkflow(ctx, snapshot)
  if (historyRoutes.some((route) => route === ctx.route)) return historyWorkflow(ctx, snapshot)
  return unavailable(ctx)
}
