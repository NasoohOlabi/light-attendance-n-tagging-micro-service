// The registry cannot identify Bun's local patch. Verify it before audit review.
export async function verifyPatchedMatchers() {
  const expected = '14b8c25d2922eda6d1acdd635857c3ed3be8a2cf542b3a885c59b30fb283be31'
  let copies = 0
  for await (const path of new Bun.Glob('**/picomatch/lib/parse.js').scan('node_modules')) {
    const source = await Bun.file(`node_modules/${path}`).arrayBuffer()
    if (new Bun.CryptoHasher('sha256').update(source).digest('hex') !== expected)
      throw new Error(`Unpatched glob parser: ${path}`)
    copies++
  }
  if (!copies) throw new Error('Patched glob parser is missing')
  const regression = Bun.spawnSync(
    [process.execPath, 'test', './tests/picomatch-security.test.ts'],
    {
      stdout: 'inherit',
      stderr: 'inherit',
    },
  )
  if (regression.exitCode !== 0) throw new Error('Patched glob regression failed')
  console.info(`Verified ${copies} locally patched picomatch copies for CVE-2026-112366`)
}
