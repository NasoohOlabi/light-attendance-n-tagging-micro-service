import { z } from 'zod'

const rpcSchema = z.object({ result: z.unknown().optional(), error: z.unknown().optional() })
const toolsSchema = z.object({ tools: z.array(z.object({ name: z.string() })) })
const resultSchema = z
  .object({
    structuredContent: z.unknown().optional(),
    content: z.array(z.unknown()).optional(),
    isError: z.boolean().optional(),
  })
  .passthrough()
const resourceSchema = z.object({
  type: z.literal('resource'),
  resource: z.object({ mimeType: z.string().optional(), blob: z.string().optional() }),
})

export class Mcp {
  constructor(
    private origin: string,
    private token: string,
  ) {}
  private async request(method: string, params: Record<string, unknown> = {}) {
    const response = await fetch(`${this.origin}/mcp`, {
      method: 'POST',
      signal: AbortSignal.timeout(15_000),
      redirect: 'error',
      headers: {
        authorization: `Bearer ${this.token}`,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: crypto.randomUUID(), method, params }),
    })
    if (!response.ok) throw new Error(`MCP request failed (${response.status})`)
    const body = rpcSchema.parse(await response.json())
    if (body.error || body.result === undefined) throw new Error('MCP request failed')
    return body.result
  }
  async tools() {
    return new Set(
      toolsSchema.parse(await this.request('tools/list')).tools.map((tool) => tool.name),
    )
  }
  async call(name: string, args: Record<string, unknown> = {}) {
    const result = resultSchema.parse(await this.request('tools/call', { name, arguments: args }))
    if (result.isError) throw new Error('MCP tool failed')
    if (result.structuredContent !== undefined) return result.structuredContent
    for (const item of result.content ?? []) {
      const resource = resourceSchema.safeParse(item)
      if (
        resource.success &&
        resource.data.resource.blob &&
        resource.data.resource.mimeType?.includes('spreadsheet')
      )
        return { blob: resource.data.resource.blob }
    }
    const text = z.object({ type: z.literal('text'), text: z.string() })
    const item = result.content
      ?.map((value) => text.safeParse(value))
      .find((value) => value.success)
    if (!item?.success) return result
    try {
      return JSON.parse(item.data.text)
    } catch {
      return item.data.text
    }
  }
}
