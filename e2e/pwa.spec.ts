import { expect, test } from '@playwright/test'
import { createServer, type Server } from 'node:http'
import { readFile, readdir, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'

let server: Server
let origin = ''
const prefix = '/notebook/'
const assets = new Map<string, Buffer>()
let workerRevision = 0
let delayNavigation = false
let legacyWorker = false
let htmlVersion = 'one'
const legacyWorkerSource = `
const scope = new URL(self.registration.scope)
const cacheName = 'wartaq-' + encodeURIComponent(scope.pathname) + '-legacy'
const index = new URL('index.html', scope).href
self.addEventListener('install', event => event.waitUntil(caches.open(cacheName).then(cache => cache.add(index))))
self.addEventListener('fetch', event => {
  if (event.request.mode === 'navigate') event.respondWith(caches.open(cacheName).then(cache => cache.match(index)))
})
`

test.beforeAll(async () => {
  async function readAssets(directory: string, path = '') {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isDirectory())
        await readAssets(join(directory, entry.name), path + entry.name + '/')
      else assets.set(path + entry.name, await readFile(join(directory, entry.name)))
    }
  }
  await readAssets('dist')
  server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost')
    if (!url.pathname.startsWith(prefix)) {
      response.writeHead(404).end()
      return
    }
    if (url.pathname === prefix + 'api/private') {
      response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
      response.end(JSON.stringify({ value: 'synthetic-private-data', method: request.method }))
      return
    }
    const file = url.pathname.slice(prefix.length) || 'index.html'
    const body = assets.get(file)
    if (!body) {
      response.writeHead(404).end()
      return
    }
    const types: Record<string, string> = {
      html: 'text/html',
      js: 'text/javascript',
      css: 'text/css',
      svg: 'image/svg+xml',
      webmanifest: 'application/manifest+json',
      png: 'image/png',
      woff2: 'font/woff2',
    }
    response.writeHead(200, {
      'content-type': types[file.split('.').pop() ?? ''] ?? 'application/octet-stream',
      'cache-control': file === 'index.html' ? 'no-cache' : 'no-store',
    })
    const content =
      file === 'sw.js'
        ? legacyWorker
          ? legacyWorkerSource
          : body.toString() + `\n// synthetic update ${workerRevision}`
        : file === 'index.html'
          ? body
              .toString()
              .replace('</head>', `<meta name="test-version" content="${htmlVersion}"></head>`)
          : body
    if (delayNavigation && file === 'index.html') setTimeout(() => response.end(content), 5000)
    else response.end(content)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Missing PWA test listener')
  origin = `http://127.0.0.1:${address.port}`
})

test.afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  )
})

test('repository-scoped PWA installs its real manifest and opens the public shell offline', async ({
  page,
  context,
}) => {
  await page.goto(origin + prefix)
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload()
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller?.scriptURL))
    .toBe(origin + prefix + 'sw.js')
  const manifestUrl = await page
    .locator('link[rel=manifest]')
    .evaluate((element) => element.getAttribute('href'))
  const response = await page.request.get(new URL(manifestUrl ?? '', origin + prefix).href)
  const manifest = z
    .object({
      name: z.string(),
      scope: z.string(),
      id: z.string(),
      start_url: z.string(),
      display: z.string(),
      theme_color: z.string(),
      background_color: z.string(),
      related_applications: z.array(
        z.object({ platform: z.string(), url: z.string(), id: z.string() }),
      ),
      icons: z.array(z.object({ src: z.string(), sizes: z.string(), purpose: z.string() })),
    })
    .parse(await response.json())
  expect(manifest.name).toBe('وارتق')
  expect(manifest.id).toBe('./')
  expect(new URL(manifest.start_url, origin + prefix + 'manifest.webmanifest').href).toBe(
    origin + prefix + '?page=app',
  )
  expect(new URL(manifest.scope, origin + prefix).href).toBe(origin + prefix)
  expect(manifest.display).toBe('standalone')
  expect(manifest.theme_color).toBe('#f5fafc')
  expect(manifest.theme_color).toBe(manifest.background_color)
  expect(manifest.related_applications).toContainEqual({
    platform: 'webapp',
    url: './manifest.webmanifest',
    id: 'https://wartaqi.up.railway.app/',
  })
  for (const icon of manifest.icons) {
    const size = Number(icon.sizes.split('x')[0])
    const dimensions = await page.evaluate(
      async (src) => {
        const image = new Image()
        image.src = src
        await image.decode()
        return { width: image.naturalWidth, height: image.naturalHeight }
      },
      new URL(icon.src, origin + prefix).href,
    )
    expect(dimensions).toEqual({ width: size, height: size })
  }
  expect(manifest.icons.some((icon) => icon.purpose === 'maskable')).toBe(true)
  const cdp = await context.newCDPSession(page)
  const browserManifest = await cdp.send('Page.getAppManifest')
  expect(browserManifest.errors).toEqual([])
  expect(browserManifest.url).toBe(origin + prefix + 'manifest.webmanifest')
  await cdp.detach()
  await page.evaluate(async () => {
    await fetch('./api/private', { headers: { Authorization: 'Bearer synthetic-private-token' } })
    await fetch('./api/private', { method: 'POST', body: 'synthetic-write' })
  })
  const cachedUrls = await page.evaluate(async () => {
    const entries = await Promise.all(
      (await caches.keys()).map(async (name) =>
        (await (await caches.open(name)).keys()).map((request) => request.url),
      ),
    )
    return entries.flat()
  })
  expect(cachedUrls.every((url) => url.startsWith(origin + prefix))).toBe(true)
  expect(cachedUrls.some((url) => /private|token=|page=|api\//.test(url))).toBe(false)
  await page.getByRole('combobox', { name: 'Color theme' }).selectOption('dark')
  await context.setOffline(true)
  const bypasses = await page.evaluate(async () =>
    Promise.all(
      [
        fetch('./api/private'),
        fetch('./favicon.svg', { headers: { Authorization: 'Bearer synthetic-private-token' } }),
        fetch('./favicon.svg?token=synthetic-private-token'),
        fetch('./api/private', { method: 'POST', body: 'synthetic-write' }),
      ].map((request) =>
        request.then(
          () => false,
          () => true,
        ),
      ),
    ),
  )
  expect(bypasses).toEqual([true, true, true, true])
  await page.reload()
  await expect(page.locator('.wartaq-home h1')).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#181a1b')
  await expect(page.getByRole('combobox', { name: 'Color theme' })).toHaveValue('dark')
  await page.getByRole('button', { name: 'Explore with sample students', exact: true }).click()
  await expect(page.locator('.workspace')).toBeVisible()
  await page.goto(origin + prefix + '?page=app&tab=attendance&date=2026-11-18')
  await expect(page.locator('.workspace-loading, .workspace-auth, .workspace')).toBeVisible()
  await expect(
    page.goto(origin + prefix + '?page=app&token=synthetic-private-token'),
  ).rejects.toThrow()
  await context.setOffline(false)
})

test('cached public shell opens without waiting for a stalled navigation', async ({
  page,
}, testInfo) => {
  await page.goto(origin + prefix)
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload()
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
  delayNavigation = true
  try {
    for (const path of ['', '?page=app', '?page=home', 'index.html']) {
      await page.goto(origin + prefix + path, { timeout: 2000 })
      await expect(
        path === '?page=app'
          ? page.locator('.workspace-loading, .workspace-auth')
          : page.locator('main h1'),
      ).toBeVisible({ timeout: 2000 })
    }
    await mkdir('.artifacts/pwa', { recursive: true })
    await page.screenshot({ path: `.artifacts/pwa/cached-shell-${testInfo.project.name}.png` })
    await expect(
      page.goto(origin + prefix + '?token=synthetic-private-token', { timeout: 1000 }),
    ).rejects.toThrow()
  } finally {
    delayNavigation = false
  }
})

test('normal refresh upgrades a legacy worker without disturbing another tab', async ({
  page,
  context,
}) => {
  legacyWorker = true
  htmlVersion = 'one'
  try {
    await page.goto(origin + prefix)
    await page.evaluate(() => navigator.serviceWorker.ready)
    await page.reload()
    await expect(page.locator('meta[name=test-version]')).toHaveAttribute('content', 'one')
    const secondPage = await context.newPage()
    await secondPage.goto(origin + prefix)
    await secondPage
      .getByRole('button', { name: 'Explore with sample students', exact: true })
      .click()
    await secondPage.getByRole('button', { name: 'Attendance', exact: true }).click()
    await secondPage.getByRole('button', { name: 'Add note for Omar', exact: true }).click()
    await secondPage.getByLabel('Note', { exact: true }).fill('Unsaved synthetic note')
    await page.evaluate(async () => {
      await caches.open('other-project-sentinel')
      const legacy = await caches.open('wartaq-' + encodeURIComponent('/notebook/') + '-legacy')
      await legacy.put('./assets/old-lazy.js', new Response('old lazy asset'))
      localStorage.setItem('synthetic-pending', 'preserved')
      const oldWorker = (await navigator.serviceWorker.getRegistration())?.active
      oldWorker?.addEventListener('statechange', () => {
        if (oldWorker.state === 'redundant')
          document.documentElement.dataset.oldWorker = 'redundant'
      })
    })
    htmlVersion = 'two'
    legacyWorker = false
    await page.evaluate(async () => {
      await (await navigator.serviceWorker.getRegistration())?.update()
    })
    await expect(page.locator('html')).toHaveAttribute('data-old-worker', 'redundant')
    await page.reload()
    await expect(page.locator('meta[name=test-version]')).toHaveAttribute('content', 'two')
    await expect(secondPage.getByLabel('Note', { exact: true })).toHaveValue(
      'Unsaved synthetic note',
    )
    expect(await page.evaluate(() => caches.has('other-project-sentinel'))).toBe(true)
    expect(
      await page.evaluate(() => fetch('./assets/old-lazy.js').then((response) => response.text())),
    ).toBe('old lazy asset')
    expect(await secondPage.evaluate(() => localStorage.getItem('synthetic-pending'))).toBe(
      'preserved',
    )
    workerRevision++
    await page.evaluate(async () => {
      await (await navigator.serviceWorker.getRegistration())?.update()
    })
    await expect(page.locator('.update-notice')).toContainText('refresh this page')
    await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'العربية', exact: true }).click()
    await expect(page.locator('.update-notice')).toContainText('حدّث الصفحة')
    await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toHaveCount(0)
    htmlVersion = 'three'
    await expect(page.locator('meta[name=test-version]')).toHaveAttribute('content', 'two')
    await Promise.all([
      page.waitForEvent('load'),
      page.getByRole('button', { name: 'تحديث', exact: true }).click(),
    ])
    await expect(page.locator('meta[name=test-version]')).toHaveAttribute('content', 'three')
    await context.setOffline(true)
    await page.reload()
    await expect(page.locator('meta[name=test-version]')).toHaveAttribute('content', 'two')
    await context.setOffline(false)
  } finally {
    legacyWorker = false
    htmlVersion = 'one'
  }
})

for (const field of ['id', 'url']) {
  test(`installed web app with matching ${field} hides install on a fresh deep link`, async ({
    page,
  }) => {
    await page.addInitScript((field) => {
      Object.defineProperty(navigator, 'getInstalledRelatedApps', {
        value: () =>
          new Promise((resolve) => {
            document.documentElement.dataset.lookupStarted = 'true'
            const app =
              field === 'id'
                ? { platform: 'webapp', id: location.origin + '/' }
                : { platform: 'webapp', url: new URL('./manifest.webmanifest', location.href).href }
            window.addEventListener('resolve-related-apps', () => resolve([app]), { once: true })
          }),
      })
    }, field)
    const link = origin + prefix + '?page=app'
    await page.goto(link)
    await expect(page.locator('html')).toHaveAttribute('data-lookup-started', 'true')
    await expect(page.locator('.install-strip')).toHaveCount(0)
    await page.evaluate(async () => {
      window.dispatchEvent(new Event('resolve-related-apps'))
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    })
    await expect(page.locator('.install-strip')).toHaveCount(0)
    await expect(page).toHaveURL(link)
  })
}

for (const outcome of ['empty', 'rejected', 'unrelated']) {
  test(`install help remains available after an ${outcome} installed-app lookup`, async ({
    page,
  }) => {
    await page.addInitScript((result) => {
      Object.defineProperty(navigator, 'install', { value: undefined })
      Object.defineProperty(navigator, 'getInstalledRelatedApps', {
        value: () =>
          result === 'rejected'
            ? Promise.reject(new Error('unavailable'))
            : Promise.resolve(
                result === 'unrelated'
                  ? [{ platform: 'webapp', id: location.origin + '/other' }]
                  : [],
              ),
      })
    }, outcome)
    await page.goto(origin + prefix)
    await page.getByRole('button', { name: 'Install Wartaq', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Close install help' })).toBeVisible()
  })
}

test('install button uses the Web Install API without a deferred prompt and handles cancellation', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'install', {
      value: () => {
        const root = document.documentElement
        root.dataset.installActivation = String(navigator.userActivation.isActive)
        root.dataset.installCalls = String(Number(root.dataset.installCalls ?? 0) + 1)
        if (root.dataset.installCalls === '1')
          return Promise.reject(new DOMException('', 'AbortError'))
        return Promise.resolve({})
      },
    })
  })
  await page.goto(origin + prefix)
  await page.getByRole('button', { name: 'Install Wartaq', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-install-calls', '1')
  await expect(page.locator('html')).toHaveAttribute('data-install-activation', 'true')
  await expect(page.getByRole('status')).toContainText('canceled or could not complete')
  await expect(page.getByRole('button', { name: 'Close install help' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Install Wartaq', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-install-calls', '2')
  await expect(page.getByRole('status')).toContainText('installed or opened')
})

test('install button calls the deferred native prompt once and localizes dismissal feedback', async ({
  page,
}) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'install', { value: undefined }))
  await page.goto(origin + prefix)
  await page.evaluate(() => {
    const event = new Event('beforeinstallprompt', { cancelable: true })
    Object.defineProperties(event, {
      prompt: {
        value: () => {
          document.documentElement.dataset.promptCalls = String(
            Number(document.documentElement.dataset.promptCalls ?? 0) + 1,
          )
          return Promise.resolve()
        },
      },
      userChoice: { value: Promise.resolve({ outcome: 'dismissed' }) },
    })
    window.dispatchEvent(event)
  })
  await page.getByRole('button', { name: 'Install Wartaq', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-prompt-calls', '1')
  await expect(page.getByRole('status')).toContainText('dismissed')
  await page.getByRole('button', { name: 'العربية', exact: true }).click()
  await expect(page.getByRole('status')).not.toContainText('dismissed')
  await page.getByRole('button', { name: 'تثبيت وارتق', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-prompt-calls', '1')
  await expect(page.getByRole('button', { name: 'إغلاق إرشادات التثبيت' })).toBeVisible()
  await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')))
  await expect(page.locator('.install-strip')).toHaveCount(0)
})

test('phone install help preserves language and is hidden when already standalone', async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'install', { value: undefined })
    Object.defineProperty(navigator, 'platform', { value: 'MacIntel' })
    Object.defineProperty(navigator, 'maxTouchPoints', { value: 5 })
  })
  await page.setViewportSize({ width: 320, height: 568 })
  await page.goto(origin + prefix)
  await page.getByRole('button', { name: 'Install Wartaq', exact: true }).click()
  await expect(page.locator('.install-guidance')).toContainText(
    'In Safari, tap Share, then Add to Home Screen.',
  )
  await page.getByRole('button', { name: 'العربية', exact: true }).click()
  await expect(page.locator('.install-guidance')).toContainText('في سفاري')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  )
  await mkdir('.artifacts/pwa', { recursive: true })
  await page.screenshot({
    path: `.artifacts/pwa/install-phone-${testInfo.project.name}.png`,
    fullPage: false,
  })
  await page.getByRole('button', { name: 'إغلاق إرشادات التثبيت' }).click()
  await expect(page.locator('.install-guidance')).toHaveCount(0)
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'standalone', { value: true })
  })
  await page.reload()
  await expect(page.locator('.install-strip')).toHaveCount(0)
})
