import { test, expect } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const profile = {
  version: 1,
  username: 'Teacher',
  apiId: 'abcde',
  token: 'secret-token',
  sheet: 'Events',
  permissionsConfirmed: true,
  updatedAt: '2026-01-01',
  revoked: false,
}

test('loopback manager rejects cross-origin requests and retains uncertain revocation across restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'manager-test-'))
  const preload = join(directory, 'provider.ts')
  await Bun.write(
    preload,
    `globalThis.fetch = async () => new Response('', { status: Number(process.env.PROVIDER_STATUS) })`,
  )
  await Bun.write(join(directory, 'manager.json'), JSON.stringify({ profiles: [profile] }))
  async function start(status: number) {
    const child = Bun.spawn(['bun', '--preload', preload, 'manager/server.ts'], {
      env: {
        ...process.env,
        MANAGER_DIRECTORY: directory,
        MANAGER_PORT: '0',
        PROVIDER_STATUS: String(status),
      },
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const reader = child.stdout.getReader()
    const result = await reader.read()
    const address = new TextDecoder()
      .decode(result.value)
      .trim()
      .replace('Local access manager: ', '')
    return { child, address }
  }
  async function post(address: string, route: string, data: unknown, origin = address) {
    return fetch(`${address}/api/${route}`, {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json', 'X-Manager-Request': '1' },
      body: JSON.stringify(data),
    })
  }
  let running = await start(401)
  try {
    expect(
      (await post(running.address, 'link', { username: 'Teacher' }, 'https://attacker.example'))
        .status,
    ).toBe(403)
    expect(
      (
        await post(running.address, 'revoke', {
          username: 'Teacher',
          confirmApiId: 'wrong',
          manual: true,
        })
      ).status,
    ).toBe(400)
    expect(
      (
        await post(running.address, 'revoke', {
          username: 'Teacher',
          confirmApiId: 'abcde',
          manual: true,
        })
      ).status,
    ).toBe(400)
    expect((await post(running.address, 'link', { username: 'Teacher' })).status).toBe(400)
    expect((await Bun.file(join(directory, 'manager.json')).json()).profiles[0].revokePending).toBe(
      true,
    )
    running.child.kill()
    await running.child.exited
    running = await start(404)
    expect((await post(running.address, 'link', { username: 'Teacher' })).status).toBe(400)
    const stateResponse = await fetch(`${running.address}/api/state`)
    expect(await stateResponse.text()).not.toContain('secret-token')
    const revoked = await post(running.address, 'revoke', {
      username: 'Teacher',
      confirmApiId: 'abcde',
      manual: true,
    })
    expect(revoked.status).toBe(200)
    expect((await revoked.json()).message).toContain('not conclusive')
    expect((await Bun.file(join(directory, 'manager.json')).json()).profiles[0].revoked).toBe(true)
  } finally {
    running.child.kill()
    await running.child.exited
    await rm(directory, { recursive: true, force: true })
  }
})

test('assigned profiles verify both endpoints, scope links, and refuse shared revocation', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'manager-assigned-'))
  const preload = join(directory, 'provider.ts')
  await Bun.write(
    preload,
    `
    globalThis.fetch = async (url, options = {}) => {
      const u = new URL(url)
      const roster = u.pathname.includes('roster-api')
      const expected = roster ? 'roster-token' : 'events-token'
      if (u.pathname.includes('public-api') && !options.headers?.Authorization) return Response.json([])
      if (options.headers?.Authorization !== 'Bearer ' + expected) return new Response('', { status: 401 })
      if (u.pathname.includes('missing-api') && u.pathname.endsWith('/keys')) return Response.json([])
      if (roster && !u.pathname.endsWith('/keys') && (u.searchParams.get('ignore_cache') !== '1' || options.cache !== 'no-store')) return new Response('', { status: 500 })
      if (u.pathname.endsWith('/keys')) return Response.json(roster
        ? ['studentId', 'name', 'teacherId', 'teacherName', 'group', 'active']
        : ['id', 'actor', 'client_time', 'received_at', 'payload'])
      return Response.json([
        { studentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'One', teacherId: '11111111-1111-4111-8111-111111111111', teacherName: 'First', group: '', active: 'TRUE' },
        { studentId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'Two', teacherId: '22222222-2222-4222-8222-222222222222', teacherName: 'Second', group: '', active: 'TRUE' }
      ])
    }
  `,
  )
  const child = Bun.spawn(['bun', '--preload', preload, 'manager/server.ts'], {
    env: { ...process.env, MANAGER_DIRECTORY: directory, MANAGER_PORT: '0' },
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const output = await child.stdout.getReader().read()
  const address = new TextDecoder()
    .decode(output.value)
    .trim()
    .replace('Local access manager: ', '')
  async function post(route: string, data: unknown) {
    return fetch(`${address}/api/${route}`, {
      method: 'POST',
      headers: { Origin: address, 'Content-Type': 'application/json', 'X-Manager-Request': '1' },
      body: JSON.stringify(data),
    })
  }
  const first = {
    version: 2,
    username: 'First',
    teacherId: '11111111-1111-4111-8111-111111111111',
    apiId: 'events-api',
    token: 'events-token',
    sheet: 'Events',
    roster: { apiId: 'roster-api', token: 'roster-token', sheet: 'Roster' },
    permissionsConfirmed: true,
  }
  const second = { ...first, username: 'Second', teacherId: '22222222-2222-4222-8222-222222222222' }
  try {
    expect(
      (await post('profile', { ...first, roster: { ...first.roster, token: 'wrong' } })).status,
    ).toBe(400)
    expect((await post('profile', { ...first, apiId: 'public-api' })).status).toBe(400)
    expect((await post('profile', { ...first, apiId: 'missing-api' })).status).toBe(400)
    expect(
      (
        await post('profile', {
          ...first,
          roster: { ...first.roster, apiId: 'public-api', token: 'events-token' },
        })
      ).status,
    ).toBe(400)
    expect(
      (
        await post('profile', {
          ...first,
          roster: { ...first.roster, apiId: 'missing-api', token: 'events-token' },
        })
      ).status,
    ).toBe(400)
    expect((await post('profile', first)).status).toBe(200)
    expect((await post('profile', second)).status).toBe(200)
    expect(
      (await post('link', { username: 'First', studentId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }))
        .status,
    ).toBe(400)
    expect(
      (await post('link', { username: 'First', studentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }))
        .status,
    ).toBe(200)
    const revoke = await post('revoke', {
      username: 'First',
      confirmApiId: 'events-api',
      manual: true,
    })
    expect(revoke.status).toBe(400)
    expect((await revoke.json()).error).toContain('Second')
    const publicData = await (await fetch(`${address}/api/state`)).text()
    expect(publicData).not.toContain('events-token')
    expect(publicData).not.toContain('roster-token')
  } finally {
    child.kill()
    await child.exited
    await rm(directory, { recursive: true, force: true })
  }
})
