import { mkdir, chmod } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const version = '8.30.1'
const os =
  process.platform === 'win32'
    ? 'windows'
    : process.platform === 'linux'
      ? 'linux'
      : process.platform === 'darwin'
        ? 'darwin'
        : null
const arch = process.arch === 'x64' || process.arch === 'arm64' ? process.arch : null
if (!os || !arch)
  throw new Error('Unsupported platform: install Gitleaks 8.30.1 into .artifacts/tools/gitleaks')
const extension = os === 'windows' ? 'zip' : 'tar.gz'
const asset = `gitleaks_${version}_${os}_${arch}.${extension}`
const base = `https://github.com/gitleaks/gitleaks/releases/download/v${version}`
const directory = resolve('.artifacts/tools/gitleaks')
await mkdir(directory, { recursive: true })
async function download(name: string) {
  const response = await fetch(`${base}/${name}`)
  if (!response.ok) throw new Error(`Security tool download failed (${response.status})`)
  return response
}
const checksums = await (await download(`gitleaks_${version}_checksums.txt`)).text()
const expected = checksums
  .split('\n')
  .map((line) => line.trim().split(/\s+/))
  .find((parts) => parts[1] === asset)?.[0]
const content = await (await download(asset)).arrayBuffer()
const actual = new Bun.CryptoHasher('sha256').update(content).digest('hex')
if (!expected || actual !== expected) throw new Error('Gitleaks checksum mismatch')
const archive = join(directory, asset)
await Bun.write(archive, content)
const result =
  os === 'windows'
    ? Bun.spawnSync(
        [
          'powershell',
          '-NoProfile',
          '-Command',
          'Expand-Archive -LiteralPath $env:GITLEAKS_ARCHIVE -DestinationPath $env:GITLEAKS_DIRECTORY -Force',
        ],
        { env: { ...process.env, GITLEAKS_ARCHIVE: archive, GITLEAKS_DIRECTORY: directory } },
      )
    : Bun.spawnSync(['tar', '-xzf', archive, '-C', directory])
if (result.exitCode !== 0) throw new Error('Could not extract security tool')
if (os !== 'windows') await chmod(join(directory, 'gitleaks'), 0o755)
console.info(`Installed checksum-verified Gitleaks ${version}`)
