import { chromium } from '@playwright/test'
import { readFile } from 'node:fs/promises'

// Rasterize the approved Arabic wordmark; no emblem or external font service.
const svg = (await readFile('public/favicon.svg', 'utf8')).replace('rx="36"', 'rx="0"')
const font = (await readFile('public/brand/wartaq/plex-arabic-700.woff2')).toString('base64')
const browser = await chromium.launch()
try {
  for (const [size, file] of [
    [192, 'pwa-192.png'],
    [512, 'pwa-512.png'],
    [512, 'pwa-maskable-512.png'],
  ]) {
    const page = await browser.newPage({
      viewport: { width: size, height: size },
      deviceScaleFactor: 1,
    })
    await page.setContent(
      `<style>@font-face{font-family:Wartaq;src:url(data:font/woff2;base64,${font});font-weight:700}html,body{margin:0;background:#004d57}svg{display:block;width:${size}px;height:${size}px}text{font-family:Wartaq,sans-serif}</style>${svg}`,
    )
    await page.evaluate(() => document.fonts.ready)
    await page.screenshot({ path: `public/${file}` })
    await page.close()
  }
} finally {
  await browser.close()
}
