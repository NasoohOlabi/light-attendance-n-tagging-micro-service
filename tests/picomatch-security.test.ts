import { expect, test } from 'bun:test'

test('installed glob matcher bounds repeated wildcards without breaking tool patterns', () => {
  const result = Bun.spawnSync(
    [
      'node',
      '-e',
      `const assert = require('node:assert/strict')
const match = require('picomatch')
for (const pattern of ['+(*a)', '+(*)b', '*(a*)', '+(*a|b)', '+(@(*a))']) {
  assert.equal(match(pattern)('a'.repeat(100) + '!'), false, pattern)
}
assert.equal(match('**/*.{ts,tsx}')('src/ProfileSettings.tsx'), true)
assert.equal(match('**/!(*.d).ts')('src/main.ts'), true)
assert.equal(match('**/!(*.d).ts')('src/main.d.ts'), false)
assert.equal(match('+(foo|bar)')('foobarfoo'), true)
assert.equal(match('+(*(a)|*(b))')('abab'), true)
`,
    ],
    { cwd: process.cwd(), timeout: 2000, stdout: 'pipe', stderr: 'pipe' },
  )
  expect(result.exitCode, result.stderr.toString()).toBe(0)
})
