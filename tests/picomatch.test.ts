import { expect, test } from 'bun:test'

test('build tools use the patched ReDoS-safe glob parser', () => {
  const result = Bun.spawnSync(['node', 'scripts/check-picomatch.cjs'], {
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 2000,
  })
  expect(new TextDecoder().decode(result.stderr)).toBe('')
  expect(result.exitCode).toBe(0)
})
