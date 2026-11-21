import { expect, test } from 'bun:test'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { registerAccountHandoffs } from '../server/mcp-account'
import type { NeonAccount } from '../shared/neon'
import type { McpOperation } from '../server/mcp-tools'

const admin: NeonAccount = {
  role: 'administrator',
  id: crypto.randomUUID(),
  name: 'Admin',
  canRead: true,
  canWrite: true,
  expiresAt: null,
  invitationProfile: { verifiedPhone: '+12025550101', phone: null, requiresSetup: false },
}

async function connect(account: NeonAccount, scopes: string[], calls: McpOperation[]) {
  const server = new McpServer({ name: 'test', version: '1' })
  registerAccountHandoffs(
    server,
    async (operation) => {
      calls.push(operation)
      return Response.json({ ok: true })
    },
    scopes,
    account,
    'https://wartaq.example',
  )
  const client = new Client({ name: 'test', version: '1' })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
  return { client, server }
}

test('pending setup links to browser and does not expose administrator tools', async () => {
  const calls: McpOperation[] = []
  const { client, server } = await connect(
    { ...admin, invitationProfile: { verifiedPhone: null, phone: null, requiresSetup: true } },
    ['mcp:read'],
    calls,
  )
  expect((await client.listTools()).tools.map((tool) => tool.name)).toEqual([
    'complete_invitation_setup',
  ])
  const result = await client.callTool({ name: 'complete_invitation_setup' })
  expect(JSON.stringify(result)).toContain('https://wartaq.example/?page=app')
  expect(calls).toEqual([])
  await client.close()
  await server.close()
})

test('phone change requires confirmation and sends normalized phone through existing API', async () => {
  const calls: McpOperation[] = []
  const { client, server } = await connect(admin, ['mcp:read', 'mcp:write'], calls)
  const input = { authUserId: 'other', phone: '0912345678', phoneConfirmed: true }
  expect(
    (
      await client.callTool({
        name: 'verify_account_phone',
        arguments: { input: { ...input, phoneConfirmed: false } },
      })
    ).isError,
  ).toBe(true)
  expect(calls).toEqual([])
  expect(
    (await client.callTool({ name: 'verify_account_phone', arguments: { input } })).isError,
  ).toBeUndefined()
  expect(calls).toEqual([
    {
      path: '/api/admin/accounts/verify-phone',
      method: 'POST',
      body: { ...input, phone: '+963912345678' },
    },
  ])
  await client.close()
  await server.close()
})
