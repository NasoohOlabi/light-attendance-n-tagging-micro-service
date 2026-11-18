import { zipSync } from 'fflate'

export async function downloadAttendancePages(
  pageCount: number,
  renderPage: (page: number) => HTMLCanvasElement,
): Promise<void> {
  const pages: Record<string, Uint8Array> = {}
  const digits = String(pageCount).length
  for (let page = 1; page <= pageCount; page++) {
    const canvas = renderPage(page)
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) => (value ? resolve(value) : reject(new Error('Could not create PNG'))),
        'image/png',
      ),
    )
    pages[`attendance-page-${String(page).padStart(digits, '0')}.png`] = new Uint8Array(
      await blob.arrayBuffer(),
    )
  }
  const archive = zipSync(pages, { level: 0 })
  const url = URL.createObjectURL(new Blob([new Uint8Array(archive)], { type: 'application/zip' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'attendance-chart-pages.zip'
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
