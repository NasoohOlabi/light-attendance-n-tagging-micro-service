import { expect, test } from 'bun:test'
import { renderBot } from '../telegram/menu'
import { isBotRoute, routeGroup, routeGroups } from '../telegram/routes'

test('every registered screen has one owner and removed destinations expire without data access', async () => {
  const routes = routeGroups.flatMap(([, values]) => [...values])
  expect(new Set(routes).size).toBe(routes.length)
  for (const [group, values] of routeGroups) {
    for (const route of values) {
      expect(isBotRoute(route)).toBe(true)
      expect(routeGroup(route)).toBe(group)
    }
  }
  for (const route of ['nb.retired', 'co.retired', 'ac.retired', 'toString']) {
    expect(isBotRoute(route)).toBe(false)
    const screen = await renderBot({
      route,
      args: {},
      lang: 'en',
      website: 'https://wartaq.example',
      tools: new Set(),
      call: () => {
        throw new Error('Expired actions must not access school records')
      },
    })
    expect(screen.rows).toEqual([[{ label: 'Open menu', action: { route: 'home' } }]])
  }
})
