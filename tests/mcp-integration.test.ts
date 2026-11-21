import { afterAll, expect, test } from 'bun:test'
import { createHash, randomBytes } from 'node:crypto'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { SignJWT, calculateJwkThumbprint, exportJWK, generateKeyPair } from 'jose'
import { Pool } from 'pg'
import { z } from 'zod'
import { invitationResponseSchema } from '../shared/invitations'
import { startIntegrationServer } from './integration-server'
import { createIdentity } from './integration-identity'

const databaseUrl = process.env.TEST_RAILWAY_DATABASE_URL
const integration = databaseUrl ? test : test.skip
const redirectUri = 'http://127.0.0.1:39386/callback'
const password = randomBytes(32).toString('base64url')
const teacherId = crypto.randomUUID()
const studentId = crypto.randomUUID()
const peerId = crypto.randomUUID()
const courseId = crypto.randomUUID()
const enrollmentId = crypto.randomUUID()
const invitationRequestId = crypto.randomUUID()
const expiredRequestId = crypto.randomUUID()
const peerTeacherId = crypto.randomUUID()
let server: ReturnType<typeof Bun.spawn> | undefined
let pool: Pool | undefined
let userId = ''
let clientId = ''
let peerUserId = ''

const tokens = z.object({ access_token: z.string(), refresh_token: z.string() })
const continuation = z.object({ url: z.string() })

afterAll(async () => {
  server?.kill()
  if (!pool) return
  for (const table of [
    'oauthAccessToken',
    'oauthRefreshToken',
    'oauthConsent',
    'oauthClientResource',
  ])
    await pool.query(`DELETE FROM neon_auth."${table}" WHERE "clientId" = $1`, [clientId])
  await pool.query('DELETE FROM neon_auth."oauthClient" WHERE "clientId" = $1', [clientId])
  await pool.query('DELETE FROM events WHERE student_id = $1', [studentId])
  await pool.query('DELETE FROM course_enrollments WHERE id = $1', [enrollmentId])
  await pool.query('DELETE FROM courses WHERE id = $1', [courseId])
  const invited = await pool.query(
    'DELETE FROM app_accounts WHERE invitation_request_id IN ($1, $2) RETURNING auth_user_id, teacher_id',
    [invitationRequestId, expiredRequestId],
  )
  for (const { auth_user_id, teacher_id } of invited.rows) {
    await pool.query('DELETE FROM teachers WHERE id = $1', [teacher_id])
    await pool.query('DELETE FROM neon_auth."user" WHERE id = $1', [auth_user_id])
  }
  await pool.query('DELETE FROM neon_auth.verification WHERE identifier IN ($1, $2)', [
    `wartaq:invite-message:${invitationRequestId}:${userId}`,
    `wartaq:invite-message:${expiredRequestId}:${userId}`,
  ])
  if (peerUserId) await pool.query('DELETE FROM app_accounts WHERE auth_user_id = $1', [peerUserId])
  await pool.query('DELETE FROM teachers WHERE id = $1', [peerTeacherId])
  if (peerUserId) await pool.query('DELETE FROM neon_auth."user" WHERE id = $1', [peerUserId])
  await pool.query('DELETE FROM app_accounts WHERE auth_user_id = $1', [userId])
  await pool.query('DELETE FROM students WHERE id IN ($1, $2)', [studentId, peerId])
  await pool.query('DELETE FROM teachers WHERE id = $1', [teacherId])
  if (userId) await pool.query('DELETE FROM neon_auth."user" WHERE id = $1', [userId])
  await pool.end()
})

function sessionCookie(response: Response) {
  const value = response.headers
    .getSetCookie()
    .find((cookie) => cookie.startsWith('better-auth.session_token='))
  if (!value) throw new Error('OAuth browser session cookie was missing')
  return value.split(';')[0]
}

integration(
  'OAuth issues scoped MCP access and enforces the notebook policy through refresh and revocation',
  async () => {
    if (!databaseUrl) throw new Error('A migrated disposable database is required')
    pool = new Pool({ connectionString: databaseUrl })
    const { origin, child } = await startIntegrationServer(databaseUrl)
    server = child
    const resource = `${origin}/mcp`
    function browserPost(path: string, body: unknown, cookie?: string, expectedUser?: string) {
      return fetch(new URL(path, origin), {
        method: 'POST',
        headers: {
          origin,
          'content-type': 'application/json',
          ...(cookie ? { cookie } : {}),
          ...(expectedUser ? { 'x-user-id': expectedUser } : {}),
        },
        body: JSON.stringify(body),
        redirect: 'manual',
      })
    }
    const denied = await fetch(resource)
    expect(denied.status).toBe(401)
    const metadataUrl = denied.headers
      .get('www-authenticate')
      ?.match(/resource_metadata="([^"]+)"/)?.[1]
    expect(metadataUrl).toBe(`${origin}/.well-known/oauth-protected-resource/mcp`)
    if (!metadataUrl) throw new Error('Protected resource metadata was missing')
    const metadata = z
      .object({ resource: z.url(), authorization_servers: z.array(z.url()).min(1) })
      .parse(await (await fetch(metadataUrl)).json())
    expect(metadata.resource).toBe(resource)
    const issuer = new URL(metadata.authorization_servers[0])
    const provider = z
      .object({
        issuer: z.url(),
        authorization_endpoint: z.url(),
        token_endpoint: z.url(),
        registration_endpoint: z.url(),
        revocation_endpoint: z.url(),
        code_challenge_methods_supported: z.array(z.string()),
        client_id_metadata_document_supported: z.literal(true),
      })
      .parse(
        await (
          await fetch(`${issuer.origin}/.well-known/oauth-authorization-server${issuer.pathname}`)
        ).json(),
      )
    expect(provider.issuer).toBe(issuer.href)
    expect(provider.code_challenge_methods_supported).toEqual(['S256'])
    const registration = await fetch(provider.registration_endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        client_name: 'Synthetic MCP client',
        redirect_uris: [redirectUri],
        token_endpoint_auth_method: 'none',
        grant_types: ['authorization_code', 'refresh_token'],
      }),
    })
    expect(registration.status).toBe(201)
    clientId = z.object({ client_id: z.string() }).parse(await registration.json()).client_id
    const verifier = randomBytes(32).toString('base64url')
    const codeChallenge = createHash('sha256').update(verifier).digest('base64url')
    const authorize = new URL(provider.authorization_endpoint)
    const state = crypto.randomUUID()
    authorize.search = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      resource,
      scope: 'mcp:read mcp:write offline_access',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    }).toString()
    const unsigned = new URL(authorize)
    unsigned.searchParams.delete('code_challenge')
    unsigned.searchParams.delete('code_challenge_method')
    const pkceRequired = await fetch(unsigned, { redirect: 'manual' })
    expect(pkceRequired.headers.get('location')).toContain('error=invalid_request')
    const loginRedirect = await fetch(authorize, { redirect: 'manual' })
    const login = new URL(loginRedirect.headers.get('location') ?? '', origin)
    expect(login.pathname).toBe('/mcp/login')
    expect((await fetch(login)).status).toBe(200)
    expect((await fetch(`${origin}/mcp/login?client_id=forged`)).status).toBe(400)

    const phone = '+12025550203'
    userId = await createIdentity(pool, 'Synthetic user', password)
    await pool.query(
      "INSERT INTO teachers (id, auth_user_id, name, access_mode) VALUES ($1, $2, 'Synthetic teacher', 'read_only')",
      [teacherId, userId],
    )
    await pool.query(
      "INSERT INTO students (id, teacher_id, name) VALUES ($1, $2, 'MCP fixture'), ($3, NULL, 'Unassigned fixture')",
      [studentId, teacherId, peerId],
    )
    await pool.query(
      "INSERT INTO app_accounts (auth_user_id, role, teacher_id, verified_phone) VALUES ($1, 'teacher', $2, $3)",
      [userId, teacherId, phone],
    )
    await pool.query("INSERT INTO courses (id, name) VALUES ($1, 'MCP course')", [courseId])
    await pool.query(
      'INSERT INTO course_enrollments (id, course_id, student_id) VALUES ($1, $2, $3)',
      [enrollmentId, courseId, studentId],
    )

    const signin = await browserPost('/api/auth/sign-in/phone', {
      phone,
      password,
      oauth_query: login.search.slice(1),
    })
    expect(signin.status).toBe(200)
    const cookie = sessionCookie(signin)
    const consentPage = new URL(continuation.parse(await signin.json()).url, origin)
    expect(consentPage.pathname).toBe('/mcp/consent')
    const consentBody = { accept: true, oauth_query: consentPage.search.slice(1) }
    expect(
      (await browserPost('/api/auth/oauth2/consent', consentBody, cookie, crypto.randomUUID()))
        .status,
    ).toBe(401)
    const consent = await browserPost('/api/auth/oauth2/consent', consentBody, cookie, userId)
    expect(consent.status).toBe(200)
    const callback = new URL(continuation.parse(await consent.json()).url)
    expect(callback.origin + callback.pathname).toBe(redirectUri)
    expect(callback.searchParams.get('state')).toBe(state)
    expect(callback.searchParams.get('iss')).toBe(provider.issuer)

    const form = (url: string, body: Record<string, string>, headers?: HeadersInit) =>
      fetch(url, {
        method: 'POST',
        headers,
        body: new URLSearchParams({ client_id: clientId, ...body }),
      })
    const exchange = {
      grant_type: 'authorization_code',
      code: callback.searchParams.get('code') ?? '',
      code_verifier: verifier,
      redirect_uri: redirectUri,
      resource,
    }
    const issued = await form(provider.token_endpoint, exchange)
    expect(issued.status).toBe(200)
    const grant = tokens.parse(await issued.json())
    expect((await fetch(resource, { headers: { cookie } })).status).toBe(401)
    expect(
      (
        await fetch(resource, {
          headers: {
            authorization: `Bearer ${grant.access_token}`,
            origin: 'https://example.test',
          },
        })
      ).status,
    ).toBe(403)
    expect(
      (
        await browserPost(
          '/api/auth/internal-mcp-token-validation',
          { authorization: `Bearer ${grant.access_token}` },
          cookie,
        )
      ).status,
    ).toBe(404)

    const transport = new StreamableHTTPClientTransport(new URL(resource), {
      requestInit: { headers: { authorization: `Bearer ${grant.access_token}` } },
    })
    const client = new Client({ name: 'Synthetic verification client', version: '1.0.0' })
    try {
      await client.connect(transport)
      const tools = (await client.listTools()).tools.map(({ name }) => name)
      expect(tools).toContain('append_events')
      expect(tools).toContain('update_student')
      expect(tools).not.toContain('save_grades')
      expect(tools).not.toContain('invite_accounts')
      const details = {
        studentId,
        firstName: 'MCP',
        lastName: 'Updated',
        group: '2',
        whatsapp: '123',
        location: 'Here',
        birthYear: 2000,
        expected: {
          firstName: 'MCP fixture',
          lastName: '',
          group: '',
          whatsapp: null,
          location: null,
          birthYear: null,
        },
      }
      expect(
        (await client.callTool({ name: 'update_student', arguments: details })).isError,
      ).not.toBe(true)
      expect(
        (
          await client.callTool({
            name: 'update_student',
            arguments: { ...details, studentId: peerId },
          })
        ).isError,
      ).toBe(true)
      expect(tools).not.toContain('get_admin_board')
      const note = {
        id: crypto.randomUUID(),
        clientTime: new Date().toISOString(),
        payload: {
          kind: 'note',
          studentId,
          date: '2026-11-19',
          tags: ['mcp'],
          text: 'Synthetic note',
        },
      }
      const attendance = {
        id: crypto.randomUUID(),
        clientTime: note.clientTime,
        payload: {
          kind: 'attendance',
          studentId,
          enrollmentId,
          date: '2026-11-19',
          status: 'present',
        },
      }
      for (let attempt = 0; attempt < 2; attempt++)
        expect(
          (
            await client.callTool({
              name: 'append_events',
              arguments: { events: [note, attendance] },
            })
          ).isError,
        ).not.toBe(true)
      const snapshot = JSON.stringify((await client.callTool({ name: 'get_notebook' })).content)
      expect(snapshot).toContain('Synthetic note')
      expect(snapshot).not.toContain(peerId)
      expect(
        (await pool.query('SELECT id FROM events WHERE student_id = $1', [studentId])).rowCount,
      ).toBe(2)
      expect(
        (
          await client.callTool({
            name: 'append_events',
            arguments: {
              events: [
                {
                  ...note,
                  id: crypto.randomUUID(),
                  payload: { ...note.payload, studentId: peerId },
                },
              ],
            },
          })
        ).isError,
      ).toBe(true)

      await pool.query("UPDATE teachers SET access_mode = 'read_write' WHERE id = $1", [teacherId])
      await pool.query("UPDATE app_accounts SET role = 'administrator' WHERE auth_user_id = $1", [
        userId,
      ])
      const report = await client.callTool({
        name: 'export_course_report',
        arguments: { courseId, report: 'attendance' },
      })
      expect(JSON.stringify(report.content)).toContain('Present')
      const workbook = await client.callTool({
        name: 'export_course_report',
        arguments: { courseId, format: 'xlsx' },
      })
      expect(JSON.stringify(workbook.content)).toContain(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      )

      const inviteTool = (await client.listTools()).tools.find(
        ({ name }) => name === 'invite_accounts',
      )
      const { ui } = z
        .object({ ui: z.object({ resourceUri: z.string().startsWith('ui://') }) })
        .parse(inviteTool?._meta)
      const widget = (await client.readResource({ uri: ui.resourceUri })).contents[0]
      expect(widget.mimeType).toBe('text/html;profile=mcp-app')
      expect('text' in widget && widget.text).toContain('Open private invitation')
      const person = {
        firstName: 'Invited',
        lastName: 'Fixture',
        role: 'teacher',
        phone: '+12025550130',
      }
      const invite = (requestId: string) =>
        client.callTool({
          name: 'invite_accounts',
          arguments: {
            input: {
              requestId,
              people: [
                {
                  ...person,
                  phone: requestId === expiredRequestId ? '+12025550131' : person.phone,
                  phoneConfirmed: true,
                },
              ],
            },
          },
        })
      const invitation = await invite(invitationRequestId)
      expect(invitation.isError).not.toBe(true)
      const { url } = z
        .strictObject({ url: z.url(), requestId: z.literal(invitationRequestId) })
        .parse(invitation.structuredContent)
      expect(url).toBe(
        `${origin}/?page=app&view=invitation-message&inviteMessage=${invitationRequestId}`,
      )
      expect(JSON.stringify(invitation.content)).toContain(url)
      const inviteId = { requestId: invitationRequestId }
      const revealPath = '/api/admin/accounts/invite-message'
      expect(
        (await fetch(`${origin}${revealPath}`, { headers: { cookie, 'x-user-id': userId } }))
          .status,
      ).toBe(405)
      expect((await browserPost(revealPath, inviteId)).status).toBe(401)
      expect((await browserPost(revealPath, inviteId, cookie, crypto.randomUUID())).status).toBe(
        401,
      )
      expect(
        (
          await fetch(`${origin}${revealPath}`, {
            method: 'POST',
            headers: {
              origin: 'https://example.test',
              'content-type': 'application/json',
              cookie,
              'x-user-id': userId,
            },
            body: JSON.stringify(inviteId),
          })
        ).status,
      ).toBe(403)

      const peerPhone = '+12025550204'
      const peerPassword = randomBytes(32).toString('base64url')
      peerUserId = await createIdentity(pool, 'Synthetic administrator', peerPassword)
      await pool.query(
        "INSERT INTO teachers (id, auth_user_id, name, access_mode) VALUES ($1, $2, $3, 'read_write')",
        [peerTeacherId, peerUserId, 'Other administrator'],
      )
      await pool.query(
        "INSERT INTO app_accounts (auth_user_id, role, teacher_id, verified_phone) VALUES ($1, 'administrator', $2, $3)",
        [peerUserId, peerTeacherId, peerPhone],
      )
      const peerSignup = await browserPost('/api/auth/sign-in/phone', {
        phone: peerPhone,
        password: peerPassword,
      })
      expect(peerSignup.status).toBe(200)
      const peerCookie = sessionCookie(peerSignup)
      expect((await browserPost(revealPath, inviteId, peerCookie, peerUserId)).status).toBe(404)
      await pool.query('UPDATE app_accounts SET active = false WHERE auth_user_id = $1', [userId])
      expect((await browserPost(revealPath, inviteId, cookie, userId)).status).toBe(403)
      await pool.query('UPDATE app_accounts SET active = true WHERE auth_user_id = $1', [userId])

      const encrypted = z
        .object({ value: z.string() })
        .parse(
          (
            await pool.query('SELECT value FROM neon_auth.verification WHERE identifier = $1', [
              `wartaq:invite-message:${invitationRequestId}:${userId}`,
            ])
          ).rows[0],
        ).value
      const reveals = await Promise.all(
        [1, 2].map(() => browserPost(revealPath, inviteId, cookie, userId)),
      )
      expect(reveals.map(({ status }) => status).sort()).toEqual([200, 404])
      const reveal = reveals.find(({ ok }) => ok)
      if (!reveal) throw new Error('The creator did not receive the invitation')
      expect(reveal.headers.get('cache-control')).toBe('no-store')
      const {
        invitations: [message],
      } = invitationResponseSchema.parse(await reveal.json())
      if (!('phone' in message)) throw new Error('Expected a phone invitation')
      expect(message).toMatchObject(person)
      expect(JSON.stringify(invitation)).not.toContain(message.temporaryPassword)
      expect(JSON.stringify(invitation)).not.toContain(message.phone)
      expect(encrypted).not.toContain(message.temporaryPassword)
      expect(encrypted).not.toContain(message.phone)
      const invitedSignIn = await browserPost('/api/auth/sign-in/phone', {
        phone: message.phone,
        password: message.temporaryPassword,
      })
      expect(invitedSignIn.status).toBe(200)
      expect((await invite(expiredRequestId)).isError).not.toBe(true)
      await pool.query(
        'UPDATE neon_auth.verification SET "expiresAt" = now() WHERE identifier = $1',
        [`wartaq:invite-message:${expiredRequestId}:${userId}`],
      )
      expect(
        (await browserPost(revealPath, { requestId: expiredRequestId }, cookie, userId)).status,
      ).toBe(404)

      await pool.query(
        "UPDATE app_accounts SET role = 'student', teacher_id = NULL, student_id = $2 WHERE auth_user_id = $1",
        [userId, studentId],
      )
      const studentTools = (await client.listTools()).tools.map(({ name }) => name)
      expect(studentTools).toContain('get_my_attendance')
      expect(studentTools).not.toContain('get_notebook')
      expect(studentTools).not.toContain('append_events')
      const own = JSON.stringify((await client.callTool({ name: 'get_my_attendance' })).content)
      expect(own).toContain('MCP course')
      expect(own).not.toContain('Synthetic note')
    } finally {
      await client.close()
    }

    const refreshed = await form(provider.token_endpoint, {
      grant_type: 'refresh_token',
      refresh_token: grant.refresh_token,
      resource,
      scope: 'mcp:read',
    })
    expect(refreshed.status).toBe(200)
    const next = tokens.parse(await refreshed.json())
    expect(next.refresh_token).not.toBe(grant.refresh_token)
    const nextHeaders = {
      authorization: `Bearer ${next.access_token}`,
      accept: 'text/event-stream',
    }
    expect((await fetch(resource, { headers: nextHeaders })).status).toBe(405)
    await pool.query('UPDATE app_accounts SET active = false WHERE auth_user_id = $1', [userId])
    const rpc = (headers: Record<string, string> = nextHeaders) =>
      fetch(resource, {
        method: 'POST',
        headers: {
          ...headers,
          accept: 'application/json, text/event-stream',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
      })
    expect((await rpc()).status).toBe(403)
    await pool.query('UPDATE app_accounts SET active = true WHERE auth_user_id = $1', [userId])
    const readOnly = z.object({
      result: z.object({ tools: z.array(z.object({ name: z.string() })) }),
    })
    const allowedTools = readOnly
      .parse(await (await rpc()).json())
      .result.tools.map(({ name }) => name)
    expect(allowedTools).toContain('get_my_attendance')
    expect(allowedTools).not.toContain('update_profile')
    expect(
      (
        await form(provider.revocation_endpoint, {
          token: next.access_token,
          token_type_hint: 'access_token',
        })
      ).status,
    ).toBe(200)
    expect((await rpc()).status).toBe(401)

    const { publicKey, privateKey } = await generateKeyPair('ES256')
    const jwk = await exportJWK(publicKey)
    const proof = (htu: string, accessToken?: string) =>
      new SignJWT({
        htu,
        htm: 'POST',
        ...(accessToken
          ? { ath: createHash('sha256').update(accessToken).digest('base64url') }
          : {}),
      })
        .setProtectedHeader({ alg: 'ES256', typ: 'dpop+jwt', jwk })
        .setIssuedAt()
        .setJti(crypto.randomUUID())
        .sign(privateKey)
    const dpopAuthorize = new URL(authorize)
    dpopAuthorize.searchParams.set('dpop_jkt', await calculateJwkThumbprint(jwk))
    const dpopRedirect = await fetch(dpopAuthorize, { redirect: 'manual', headers: { cookie } })
    const dpopCode = new URL(dpopRedirect.headers.get('location') ?? '', origin).searchParams.get(
      'code',
    )
    expect(dpopCode).toBeTruthy()
    const dpopIssue = await form(
      provider.token_endpoint,
      { ...exchange, code: dpopCode ?? '' },
      { dpop: await proof(provider.token_endpoint) },
    )
    expect(dpopIssue.status).toBe(200)
    const dpopGrant = tokens.extend({ token_type: z.literal('DPoP') }).parse(await dpopIssue.json())
    const boundHeaders = {
      authorization: `DPoP ${dpopGrant.access_token}`,
      dpop: await proof(resource, dpopGrant.access_token),
    }
    expect((await rpc({ authorization: `Bearer ${dpopGrant.access_token}` })).status).toBe(401)
    expect((await rpc(boundHeaders)).status).toBe(200)
    expect((await rpc(boundHeaders)).status).toBe(401)
    expect((await browserPost('/api/auth/sign-out', {}, cookie, userId)).status).toBe(200)
    expect(
      (
        await rpc({
          authorization: boundHeaders.authorization,
          dpop: await proof(resource, dpopGrant.access_token),
        })
      ).status,
    ).toBe(401)
    expect((await form(provider.token_endpoint, exchange)).status).toBe(400)
  },
  25_000,
)
