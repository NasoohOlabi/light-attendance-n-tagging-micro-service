import { expect, test } from 'bun:test'
import { accounts } from '../telegram/accounts'
import type { Action, BotContext, Screen } from '../telegram/types'

const id = '11111111-1111-4111-8111-111111111111'
const action = (screen: Screen, label: string): Action => {
  const item = screen.rows.flat().find((button) => button.label === label)
  if (!item || !('action' in item)) throw new Error(`Missing ${label}`)
  return item.action
}
const board = {
  accounts: [
    {
      authUserId: 'user-1',
      name: 'Example',
      role: 'teacher',
      active: true,
      expiresAt: null,
      teacherId: id,
      studentId: null,
    },
  ],
  teachers: [],
  students: [],
}
test('invitation requires direct phone confirmation and returns private link', async () => {
  const calls: { name: string; args?: Record<string, unknown> }[] = []
  const ctx: BotContext = {
    lang: 'en',
    route: 'ac.invite.name',
    args: { role: 'teacher' },
    input: 'Example\u060c User',
    tools: new Set(['get_admin_board', 'invite_accounts']),
    website: 'https://example.test',
    call: async (name, args) => {
      calls.push({ name, args })
      if (name === 'get_admin_board') return board
      const input = args?.input
      if (typeof input !== 'object' || input === null || !('requestId' in input))
        throw new Error('missing input')
      return {
        requestId: input.requestId,
        url: 'https://example.test/?page=app&view=invitation-message',
      }
    },
  }
  const next = await accounts(ctx)
  expect(next.prompt?.route).toBe('ac.invite.phone')
  expect(calls.some((call) => call.name === 'get_admin_board')).toBe(false)
  const confirmation = await accounts({
    ...ctx,
    route: 'ac.invite.phone',
    args: next.prompt?.args ?? {},
    input: '+963912345678',
  })
  expect(calls.some((call) => call.name === 'invite_accounts')).toBe(false)
  const confirm = action(confirmation, 'Yes, confirmed directly')
  const done = await accounts({
    ...ctx,
    route: confirm.route,
    args: confirm.args ?? {},
    input: undefined,
  })
  expect(
    done.rows.flat().some((item) => 'url' in item && item.url.startsWith('https://example.test/')),
  ).toBe(true)
  expect(calls.filter((call) => call.name === 'invite_accounts')).toHaveLength(1)
})
test('profile rename preserves photo and detects changed name', async () => {
  let name = 'Original'
  const writes: unknown[] = []
  const ctx: BotContext = {
    lang: 'en',
    route: 'ac.profile.name',
    args: {},
    input: 'New name',
    tools: new Set(['get_profile', 'update_profile']),
    website: 'https://example.test',
    call: async (tool, args) => {
      if (tool === 'get_profile') return { name, image: 'photo' }
      writes.push(args)
      return {}
    },
  }
  const confirm = action(await accounts(ctx), 'Confirm')
  name = 'Changed elsewhere'
  expect(
    (await accounts({ ...ctx, route: confirm.route, args: confirm.args ?? {}, input: undefined }))
      .text,
  ).toContain('changed')
  expect(writes).toHaveLength(0)
  name = 'Original'
  await accounts({ ...ctx, route: confirm.route, args: confirm.args ?? {}, input: undefined })
  expect(writes).toEqual([{ input: { name: 'New name' } }])
})
test('account screen uses targeted settings and denies unauthorized listing', async () => {
  const ctx: BotContext = {
    lang: 'ar',
    route: 'ac.view',
    args: { account: 'user-1' },
    tools: new Set(['get_admin_board']),
    website: 'https://example.test',
    call: async () => board,
  }
  const view = await accounts(ctx)
  expect(view.text).toContain('معلم')
  expect(
    view.rows
      .flat()
      .some((item) => 'url' in item && new URL(item.url).searchParams.get('account') === 'user-1'),
  ).toBe(true)
  expect((await accounts({ ...ctx, tools: new Set() })).text).toContain('غير متاح')
})
