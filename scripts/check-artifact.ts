import { readdir } from 'node:fs/promises'
import { join } from 'node:path'

async function walk(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const groups = await Promise.all(
    entries.map((entry) =>
      entry.isDirectory() ? walk(join(directory, entry.name)) : [join(directory, entry.name)],
    ),
  )
  return groups.flat()
}
const files = await walk('dist')
for (const file of files) {
  if (!/\.(html|css|js|png|ico|svg|woff2|txt)$/.test(file))
    throw new Error(`Unexpected deployment file: ${file}`)
  if (/\.(png|ico|woff2)$/.test(file)) continue
  const text = await Bun.file(file).text()
  for (const secret of [
    process.env.DATABASE_URL,
    process.env.DATABASE_URL_UNPOOLED,
    process.env.NEON_API_KEY,
  ])
    if (secret && text.includes(secret)) throw new Error(`Server credential found in ${file}`)
  if (/postgres(?:ql)?:\/\/[^\s"']+:[^\s"']+@/.test(text))
    throw new Error(`Database credential found in ${file}`)
  if (
    /manager\.json|Management credentials loaded|globalCredentialsSchema|SHEETDB_GLOBAL|sourceMappingURL=/.test(
      text,
    )
  )
    throw new Error(`Private manager or source map in ${file}`)
}
const html = await Bun.file('dist/index.html').text()
if (!html.includes('no-referrer') || !html.includes('Content-Security-Policy'))
  throw new Error('Teacher security policy missing')
if (/src="\/(?!\/)/.test(html) || /href="\/(?!\/)/.test(html))
  throw new Error('Absolute asset path breaks repository Pages hosting')
console.info(`Deployment boundary checked: ${files.length} teacher-only files`)
