import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { verifiedPhoneInputSchema } from '../shared/invitations'
import { neonAdminGeneratedPasswordResetSchema, type NeonAccount } from '../shared/neon'
import type { McpOperation } from './mcp-tools'

export function registerAccountHandoffs(
  server: McpServer,
  call: (operation: McpOperation) => Promise<Response>,
  scopes: readonly string[],
  account: NeonAccount,
  origin: string,
) {
  const read = scopes.includes('mcp:read')
  const write = scopes.includes('mcp:write')
  const ready =
    !account.invitationProfile?.requiresSetup &&
    (!account.expiresAt || Date.parse(account.expiresAt) > Date.now())
  const link = (view?: string, accountId?: string) => {
    const url = new URL('/', origin)
    url.search = new URLSearchParams({
      page: 'app',
      ...(view ? { view } : {}),
      ...(accountId ? { account: accountId } : {}),
    }).toString()
    return url.href
  }
  const handoff = (message: string, url: string) => ({
    content: [{ type: 'text' as const, text: `${message} ${url}` }],
  })
  if ((read || write) && account.invitationProfile?.requiresSetup)
    server.registerTool(
      'complete_invitation_setup',
      {
        description:
          'Open private browser setup for the signed-in account. Do not share passwords with the MCP client.',
        annotations: { readOnlyHint: true },
      },
      () => handoff('Open this link and sign in as the account being set up:', link()),
    )
  if (write && account.invitationProfile && ready)
    server.registerTool(
      'open_invitation_profile',
      {
        description:
          'Open your private profile in the browser to change invitation details or password.',
        annotations: { readOnlyHint: true },
      },
      () => handoff('Open your profile and sign in as the intended account:', link('profile')),
    )
  if (
    read &&
    write &&
    ready &&
    account.role === 'administrator' &&
    account.canRead &&
    account.canWrite
  ) {
    server.registerTool(
      'open_password_reset',
      {
        description: 'Open account settings in the browser to reset a password privately.',
        inputSchema: neonAdminGeneratedPasswordResetSchema.partial(),
        annotations: { readOnlyHint: true },
      },
      ({ authUserId }) =>
        handoff(
          'Open Accounts as the intended administrator, then select Reset password.',
          link('settings', authUserId),
        ),
    )
    server.registerTool(
      'verify_account_phone',
      {
        description:
          'Change an account sign-in phone after directly confirming ownership with its holder. Set phoneConfirmed to true only after that confirmation. A changed phone revokes the account sessions.',
        inputSchema: z.object({ input: verifiedPhoneInputSchema }),
      },
      async ({ input }) => {
        const response = await call({
          path: '/api/admin/accounts/verify-phone',
          method: 'POST',
          body: input,
        })
        return {
          content: [{ type: 'text', text: await response.text() }],
          ...(response.ok ? {} : { isError: true }),
        }
      },
    )
  }
}
