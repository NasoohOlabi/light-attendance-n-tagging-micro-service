import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { functionBaseUrl } from '@neon/env'
import { z } from 'zod'

function publicUrl(value: string): string {
  if (!value) return ''
  const parsed = new URL(z.url().parse(value))
  if (
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    (parsed.protocol !== 'https:' &&
      !(parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname)))
  )
    throw new Error('Neon browser endpoints require HTTPS or a local development URL.')
  return parsed.href.replace(/\/$/, '')
}

export default defineConfig(({ mode }) => {
  const environment = { ...loadEnv(mode, process.cwd(), ''), ...process.env }
  const authUrl = publicUrl(
    mode === 'verification'
      ? ''
      : (environment.VITE_NEON_AUTH_URL ?? environment.NEON_AUTH_BASE_URL ?? ''),
  )
  const apiUrl = publicUrl(
    mode === 'verification'
      ? ''
      : (environment.VITE_NEON_API_URL ??
          (environment.NEON_BRANCH_ID && environment.NEON_FUNCTION_HOST_SUFFIX
            ? functionBaseUrl('notebook', {
                NEON_BRANCH_ID: environment.NEON_BRANCH_ID,
                NEON_FUNCTION_HOST_SUFFIX: environment.NEON_FUNCTION_HOST_SUFFIX,
              })
            : '')),
  )
  const origins = [...new Set([authUrl, apiUrl].filter(Boolean).map((url) => new URL(url).origin))]
  return {
    base: './',
    define: {
      'import.meta.env.VITE_NEON_AUTH_URL': JSON.stringify(authUrl),
      'import.meta.env.VITE_NEON_API_URL': JSON.stringify(apiUrl),
    },
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'neon-security-policy',
        transformIndexHtml(html, context) {
          if (context.server)
            return html.replace(/\s*<meta\s+http-equiv="Content-Security-Policy"[^>]*>/, '')
          return html.replace('https://sheetdb.io', ['https://sheetdb.io', ...origins].join(' '))
        },
      },
    ],
    server: { port: 5173, strictPort: true },
  }
})
