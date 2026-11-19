import { cimd } from '@better-auth/cimd'
import { fetchClientMetadataResource } from '@better-auth/cimd/node'
import { mcp } from '@better-auth/mcp'
import { getOAuthProviderApi } from '@better-auth/oauth-provider'
import { createAuthEndpoint } from 'better-auth/api'
import {
  createDpopReplayStore,
  enforceDpopBinding,
  parseAccessTokenAuthorization,
} from 'better-auth/oauth2'
import { z } from 'zod'

export function createMcpOAuthPlugins(origin: string) {
  const resource = `${origin}/mcp`
  const options = {
    resource,
    resources: [resource],
    loginPage: '/mcp/login',
    consentPage: '/mcp/consent',
    selectAccount: { page: '/mcp/login', shouldRedirect: () => false },
    scopes: ['mcp:read', 'mcp:write', 'offline_access'],
    grantTypes: ['authorization_code', 'refresh_token'],
    allowDynamicClientRegistration: true,
    allowUnauthenticatedClientRegistration: true,
    clientRegistrationRequirePKCE: true,
    clientRegistrationDefaultApplicationType: 'infer',
    disableJwtPlugin: true,
    storeTokens: 'hashed',
    refreshTokenReuseInterval: 0,
  } satisfies Parameters<typeof mcp>[0]
  const provider = mcp(options)
  return [
    provider,
    cimd({ fetchClientMetadataResource }),
    {
      id: 'mcp-local-validation',
      endpoints: {
        validateMcpToken: createAuthEndpoint.serverOnly(
          {
            method: 'POST',
            body: z.object({
              authorization: z.string().max(4096),
              method: z.string().max(32),
              proof: z.string().max(8192).nullable(),
            }),
          },
          async (ctx) => {
            try {
              const authorization = parseAccessTokenAuthorization(ctx.body.authorization)
              if (!authorization || authorization.scheme === 'Unknown') return null
              const claims = await getOAuthProviderApi(
                ctx,
                provider.options,
              ).requireActiveAccessToken(authorization.token)
              const parsed = z
                .object({
                  sub: z.uuid(),
                  sid: z.string().min(1),
                  aud: z.union([z.string(), z.array(z.string())]),
                  scope: z.string(),
                })
                .safeParse(claims)
              if (!parsed.success || ![parsed.data.aud].flat().includes(resource)) return null
              await enforceDpopBinding({
                payload: claims,
                authorization,
                proofJwt: ctx.body.proof,
                url: resource,
                method: ctx.body.method,
                replayStore: createDpopReplayStore(ctx.context),
              })
              return { userId: parsed.data.sub, scopes: parsed.data.scope.split(' ') }
            } catch {
              return null
            }
          },
        ),
      },
    },
  ]
}
