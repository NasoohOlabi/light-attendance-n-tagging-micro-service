import { accountRoutes } from './accounts'
import { courseRoutes } from './courses'
import { notebookRoutes } from './notebook'

const systemRoutes = ['home', 'sys.home', 'sys.language', 'sys.unlink'] as const
export const routeGroups = [
  ['system', systemRoutes],
  ['notebook', notebookRoutes],
  ['courses', courseRoutes],
  ['accounts', accountRoutes],
] as const
type Group = (typeof routeGroups)[number][0]
export type BotRoute = (typeof routeGroups)[number][1][number]

const ownership = new Map<string, Group>()
for (const [group, routes] of routeGroups) {
  for (const route of routes) {
    if (ownership.has(route)) throw new Error(`Duplicate bot route: ${route}`)
    ownership.set(route, group)
  }
}
export function isBotRoute(value: unknown): value is BotRoute {
  return typeof value === 'string' && ownership.has(value)
}
export function routeGroup(route: string) {
  return ownership.get(route)
}
