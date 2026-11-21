import type { BotRoute } from './routes'

export type Action = {
  route: BotRoute
  args?: Record<string, string>
}

export type Button = { label: string; action: Action } | { label: string; url: string }

export type Screen = {
  text: string
  rows: Button[][]
  prompt?: Action
  document?: { name: string; bytes: Uint8Array }
}

export type BotContext = {
  lang: 'en' | 'ar'
  website: string
  route: string
  args: Record<string, string>
  input?: string
  tools: ReadonlySet<string>
  call: (name: string, args?: Record<string, unknown>) => Promise<unknown>
}
