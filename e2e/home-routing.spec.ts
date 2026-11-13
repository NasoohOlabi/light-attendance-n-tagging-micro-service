import { expect, test } from '@playwright/test'
import { encodeAccess } from '../shared/access'
import { HEADERS } from '../shared/ledger'

test('plain root stays public with a stored private session and samples never use it', async ({
  page,
}) => {
  const capability = encodeAccess({
    version: 1,
    username: 'Synthetic Teacher',
    apiId: 'synthetic-home-routing',
    token: 'synthetic-home-token',
    sheet: 'Events',
  })
  const requests: string[] = []
  await page.route('https://sheetdb.io/**', async (route) => {
    const request = route.request()
    requests.push(request.method())
    expect(request.method()).toBe('GET')
    return route.fulfill({
      json: new URL(request.url()).pathname.endsWith('/keys') ? HEADERS : [],
    })
  })
  await page.goto(`/#access=${capability}`)
  await expect(page.locator('.workspace')).toBeVisible()
  await expect(page).toHaveURL(/page=app/)
  expect(new URL(page.url()).hash).toBe('')
  await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeEnabled()
  await expect(page.getByText('Loading the shared notebook…', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('alert')).toHaveCount(0)
  const initialRequests = requests.length
  await page.goto('/')
  await expect(page.locator('.wartaq-home')).toBeVisible()
  await expect(page.locator('.workspace')).toHaveCount(0)
  expect(requests.length).toBe(initialRequests)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.locator('.workspace')).toBeVisible()
  await expect(page).toHaveURL(/page=app/)
  await expect(page.getByText('Loading the shared notebook…', { exact: true })).toHaveCount(0)
  await page.goto('/')
  await expect(page.locator('.wartaq-home')).toBeVisible()
  const beforeSample = requests.length
  await page.getByRole('button', { name: 'Explore with sample students', exact: true }).click()
  await expect(page.locator('.workspace')).toBeVisible()
  await expect(page.getByText('Sample notebook.', { exact: false })).toBeVisible()
  expect(requests.length).toBe(beforeSample)
})
