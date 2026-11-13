import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { functionBaseUrl } from '@neon/env'
import { z } from 'zod'

function publicAssets(directory: string, prefix = ''): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const name = prefix + entry.name
    return entry.isDirectory()
      ? publicAssets(join(directory, entry.name), `${name}/`)
      : /\.(?:png|ico|svg|woff2|webmanifest)$/.test(name)
        ? [name]
        : []
  })
}

function pwa(): Plugin {
  return {
    name: 'pwa-service-worker',
    enforce: 'post',
    apply: 'build',
    generateBundle(_options, bundle) {
      const files = publicAssets('public').sort()
      const hash = createHash('sha256')
      for (const file of files) hash.update(file).update(readFileSync(join('public', file)))
      for (const [name, output] of Object.entries(bundle).sort(([a], [b]) => a.localeCompare(b))) {
        if (!/\.(?:html|js|css|woff2|svg|png)$/.test(name)) continue
        files.push(name)
        hash.update(name).update(output.type === 'chunk' ? output.code : output.source)
      }
      const version = hash.digest('hex').slice(0, 16)
      const source = `
const scope = new URL(self.registration.scope)
const prefix = 'wartaq-' + encodeURIComponent(scope.pathname) + '-'
const cacheName = prefix + ${JSON.stringify(version)}
const urls = ${JSON.stringify(files)}.map((file) => new URL(file, scope).href)
const index = new URL('index.html', scope).href
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(cacheName).then((cache) => cache.addAll(urls)))
})
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key.startsWith(prefix) && key !== cacheName).map((key) => caches.delete(key))
  )))
})
self.addEventListener('fetch', (event) => {
  const request = event.request
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== scope.origin || request.headers.has('Authorization')) return
  if (request.mode === 'navigate') {
    const safeQuery = !url.search || (url.searchParams.size === 1 && ['app', 'home'].includes(url.searchParams.get('page')))
    if (!safeQuery || (url.pathname !== scope.pathname && url.pathname !== new URL('index.html', scope).pathname)) return
    event.respondWith(fetch(request).catch(() => caches.open(cacheName).then((cache) => cache.match(index))))
    return
  }
  if (!url.search && urls.includes(url.href)) {
    event.respondWith(caches.open(cacheName).then((cache) => cache.match(request).then((response) => response || fetch(request))))
  }
})
`
      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}

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
      pwa(),
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
