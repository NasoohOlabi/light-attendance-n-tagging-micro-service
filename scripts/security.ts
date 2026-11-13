import { existsSync } from 'node:fs'
import { join } from 'node:path'

const binary = join(
  '.artifacts',
  'tools',
  'gitleaks',
  process.platform === 'win32' ? 'gitleaks.exe' : 'gitleaks',
)
if (!existsSync(binary))
  throw new Error('Secret scanner missing. Run bun run setup:security. Checks fail closed.')
const mode = process.argv[2]
if (mode === 'staged' || mode === 'history') {
  const listing = Bun.spawnSync(
    mode === 'staged'
      ? ['git', 'diff', '--cached', '--name-only', '--diff-filter=ACMR']
      : ['git', 'log', '--all', '--format=', '--name-only'],
    { stdout: 'pipe', stderr: 'inherit' },
  )
  if (listing.exitCode !== 0) process.exit(listing.exitCode)
  const blocked = new TextDecoder()
    .decode(listing.stdout)
    .split(/\r?\n/)
    .filter(
      (path) =>
        /(^|\/)(\.local|\.env(?:\..*)?|credentials\.json|serviceAccount[^/]*\.json)(\/|$)|\.(pem|key|csv)$/i.test(
          path,
        ) && !path.endsWith('.env.example'),
    )
  if (blocked.length)
    throw new Error(`Private data paths cannot be published: ${[...new Set(blocked)].join(', ')}`)
}
const args =
  mode === 'staged'
    ? ['git', '--staged']
    : mode === 'history'
      ? ['git', '--log-opts=--all']
      : mode === 'files'
        ? ['dir', 'dist']
        : null
if (!args) throw new Error('Use staged, history, or files')
// No verbose findings: scanners must never print matched credentials.
const result = Bun.spawnSync([binary, ...args, '--redact', '--no-banner'], {
  stdout: 'inherit',
  stderr: 'inherit',
})
process.exit(result.exitCode)
