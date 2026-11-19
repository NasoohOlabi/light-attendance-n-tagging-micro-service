import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { DPOP_SIGNING_ALGORITHMS } from 'better-auth/oauth2'
import { z } from 'zod'
import { neonAccountSchema } from '../shared/neon'
import { registerMcpTools, type McpOperation } from './mcp-tools'

const accountResponse = z.object({ account: neonAccountSchema })

export function createMcpHandler(
  origin: string,
  validateRequest: (request: Request) => Promise<{ userId: string; scopes: string[] } | null>,
  callAsUser: (userId: string, operation: McpOperation) => Promise<Response>,
) {
  const resourceMetadata = `${origin}/.well-known/oauth-protected-resource/mcp`
  const challenge = `Bearer resource_metadata="${resourceMetadata}"`
  const host = new URL(origin).host

  return async (request: Request) => {
    const error = (message: string, status: number, headers: HeadersInit = {}) =>
      Response.json(
        { jsonrpc: '2.0', error: { code: -32000, message }, id: null },
        { status, headers: { 'Cache-Control': 'no-store', ...headers } },
      )
    const requestOrigin = request.headers.get('origin')
    if (new URL(request.url).host !== host || (requestOrigin && requestOrigin !== origin))
      return error('Forbidden', 403)
    const authorization = request.headers.get('authorization')
    const identity = authorization ? await validateRequest(request) : null
    if (!identity)
      return error('Unauthorized', 401, {
        'WWW-Authenticate': `${challenge}, scope="mcp:read mcp:write offline_access"${authorization ? ', error="invalid_token"' : ''}, DPoP algs="${DPOP_SIGNING_ALGORITHMS.join(' ')}"`,
      })
    if (!identity.scopes.includes('mcp:read') && !identity.scopes.includes('mcp:write'))
      return error('Insufficient scope', 403, {
        'WWW-Authenticate': `${challenge}, error="insufficient_scope", scope="mcp:read"`,
      })
    // The server offers request/response tools and has no long-lived MCP session.
    if (request.method !== 'POST') return error('Method not allowed', 405, { Allow: 'POST' })
    const call: Parameters<typeof registerMcpTools>[1] = (operation) =>
      callAsUser(identity.userId, operation)
    const access = await call({ path: '/api/me', method: 'GET' })
    if (!access.ok)
      return error(access.status === 403 ? 'Forbidden' : 'Server error', access.status)
    const { account } = accountResponse.parse(await access.json())
    const server = new McpServer({ name: 'Wartaq', version: '0.1.0' })
    const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true })
    registerMcpTools(server, call, identity.scopes, account, identity)
    try {
      await server.connect(transport)
      const response = await transport.handleRequest(request)
      response.headers.set('Cache-Control', 'no-store')
      return response
    } finally {
      await server.close()
    }
  }
}
