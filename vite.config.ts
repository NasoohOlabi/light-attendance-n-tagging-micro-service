import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

function publicAssets(directory: string, prefix = ''): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const name = prefix + entry.name
    return entry.isDirectory()
      ? publicAssets(join(directory, entry.name), `${name}/`)
      : /\.(?:js|png|ico|svg|woff2|webmanifest)$/.test(name)
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
const appNavigationKeys = new Set(['page', 'view', 'tab', 'course', 'date', 'from', 'to', 'courseView', 'all', 'missing', 'unmarked', 'tables', 'q', 'group', 'student', 'account'])
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(cacheName).then((cache) => cache.addAll(urls)).then(() => self.skipWaiting()))
})
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key.startsWith(prefix) && key !== cacheName).slice(0, -1).map((key) => caches.delete(key))
  )))
})
self.addEventListener('fetch', (event) => {
  const request = event.request
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== scope.origin || request.headers.has('Authorization')) return
  if (request.mode === 'navigate') {
    const safeQuery = !url.search ||
      (url.searchParams.size === 1 && url.searchParams.get('page') === 'home') ||
      (url.searchParams.getAll('page').length === 1 && url.searchParams.get('page') === 'app' &&
        [...url.searchParams.keys()].every((key) => appNavigationKeys.has(key)))
    if (!safeQuery || (url.pathname !== scope.pathname && url.pathname !== new URL('index.html', scope).pathname)) return
    event.respondWith((async () => {
      const cache = await caches.open(cacheName)
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 1000)
      try {
        const response = await fetch(request, { signal: controller.signal, cache: 'no-cache' })
        return response
      } catch (error) {
        return (await cache.match(index)) || Promise.reject(error)
      } finally {
        clearTimeout(timeout)
      }
    })())
    return
  }
  if (!url.search && (urls.includes(url.href) || url.pathname.startsWith(new URL('assets/', scope).pathname))) {
    event.respondWith((async () => {
      // Precached static files are identical across Origin and Accept-Encoding variants.
      const current = await (await caches.open(cacheName)).match(request, { ignoreVary: true })
      if (current) return current
      const previous = (await caches.keys()).filter((key) => key.startsWith(prefix) && key !== cacheName)
      for (const key of previous) {
        const cached = await (await caches.open(key)).match(request, { ignoreVary: true })
        if (cached) return cached
      }
      return fetch(request)
    })())
  }
})
`
      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}

export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [
    pwa(),
    react(),
    tailwindcss(),
    ...(mode === 'verification'
      ? [
          {
            name: 'verification-api-boundary',
            configurePreviewServer(server) {
              server.middlewares.use('/api', (request, response) => {
                const path = request.url?.split('?')[0]
                const chooser = request.method === 'GET' && path === '/device-accounts'
                response.statusCode = chooser || path === '/auth/get-session' ? 200 : 401
                response.setHeader('Content-Type', 'application/json')
                response.end(chooser ? JSON.stringify({ accounts: [] }) : 'null')
              })
            },
          } satisfies Plugin,
        ]
      : []),
    {
      name: 'development-security-policy',
      transformIndexHtml(html, context) {
        return context.server
          ? html.replace(/\s*<meta\s+http-equiv="Content-Security-Policy"[^>]*>/, '')
          : html
      },
    },
  ],
  server: { port: 5173, strictPort: true, proxy: { '/api': 'http://127.0.0.1:3000' } },
}))
