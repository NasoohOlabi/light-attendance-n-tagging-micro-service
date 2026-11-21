import { expect, test } from '@playwright/test'
import { mcpConsentPage } from '../server/mcp-consent'

for (const width of [320, 1440]) {
  for (const language of ['en', 'ar']) {
    for (const path of ['/mcp/login', '/mcp/consent']) {
      test(`MCP setup handoff at ${path} ${width}px ${language}`, async ({ browser, baseURL }) => {
        const context = await browser.newContext({ viewport: { width, height: 800 } })
        let pending = true
        let consentQuery = ''
        await context.route('**/*', async (route) => {
          const request = route.request()
          const url = new URL(request.url())
          if (url.pathname === '/mcp/consent' || url.pathname === '/mcp/login') {
            const page = mcpConsentPage(new Request(url))
            await route.fulfill({
              status: 200,
              headers: Object.fromEntries(page.headers),
              body: await page.text(),
            })
          } else if (url.pathname === '/api/auth/get-session') {
            await route.fulfill({ json: { user: { id: 'synthetic-user', name: 'Synthetic' } } })
          } else if (url.pathname === '/api/device-accounts') {
            await route.fulfill({ json: { accounts: [] } })
          } else if (url.pathname === '/api/me') {
            expect(request.headers()['x-user-id']).toBe('synthetic-user')
            await route.fulfill({
              json: { account: { invitationProfile: { requiresSetup: pending } } },
            })
          } else if (url.pathname === '/' && url.search === '?page=app') {
            await route.fulfill({
              contentType: 'text/html',
              body: '<button>Complete setup</button><script>document.querySelector("button").onclick=()=>fetch("/synthetic-complete",{method:"POST"})</script>',
            })
          } else if (url.pathname === '/synthetic-complete') {
            pending = false
            await route.fulfill({ json: { saved: true } })
          } else if (
            url.pathname === '/api/auth/oauth2/consent' ||
            url.pathname === '/api/auth/oauth2/continue'
          ) {
            consentQuery = JSON.parse(request.postData() || '{}').oauth_query
            await route.fulfill({ json: { url: '/synthetic-finished' } })
          } else {
            await route.fulfill({ contentType: 'text/html', body: 'Finished' })
          }
        })
        const page = await context.newPage()
        const query = 'client_id=synthetic&scope=mcp%3Aread&signed=synthetic-signature'
        await page.goto(`${baseURL}${path}?${query}`)
        if (language === 'ar') await page.locator('#language').click()
        const link = page.locator('#setup a')
        await expect(link).toBeVisible()
        expect(await link.getAttribute('target')).toBe('_blank')
        expect(await link.getAttribute('rel')).toContain('noreferrer')
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        )
        const [popup] = await Promise.all([context.waitForEvent('page'), link.click()])
        await popup.waitForLoadState()
        expect(popup.url()).toBe(`${baseURL}/?page=app`)
        await popup.getByText('Complete setup').click()
        await expect.poll(() => pending).toBe(false)
        expect(new URL(page.url()).search.slice(1)).toBe(query)
        await page.reload()
        await expect(link).toBeHidden()
        if (language === 'ar') await page.locator('#language').click()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        )
        await page.locator(path === '/mcp/consent' ? '#accept' : '#resume').click()
        await expect.poll(() => consentQuery).toBe(query)
        await context.close()
      })
    }
  }
}
