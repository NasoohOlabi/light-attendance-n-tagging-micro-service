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
