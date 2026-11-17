const assert = require('node:assert/strict')
const { createHash } = require('node:crypto')
const { readFileSync } = require('node:fs')
const { createRequire } = require('node:module')
const { dirname, join } = require('node:path')

// Check the actual copies used by each build tool before allowing the patched advisory.
const copies = new Set(
  ['vite', 'lint-staged', 'tinyglobby', 'fdir'].map((tool) =>
    createRequire(require.resolve(tool)).resolve('picomatch'),
  ),
)
for (const path of copies) {
  const parser = readFileSync(join(dirname(path), 'lib/parse.js'))
  assert.equal(
    createHash('sha256').update(parser).digest('hex'),
    '9bd315f0306e4c0caeb271b0419bb72605b03cd013c1793b1c9941b62d4736db',
  )
  const picomatch = require(path)
  for (const pattern of ['+(*)', '+(*a)', '*(*a)', '+(a*)', '+(a*b)', '*(*.js)']) {
    assert(!/\)[+*]/.test(picomatch.makeRe(pattern).source), `${pattern} nests quantifiers`)
  }
  for (const pattern of ['+(*a)', '*(*a)', '+(*a)c', 'x+(*a)']) {
    assert(!picomatch.isMatch('a'.repeat(50) + 'b', pattern))
  }
  for (const [value, pattern] of [
    ['src/App.tsx', '**/*.{ts,tsx}'],
    ['abc', '+(*)c'],
    ['aaa', '+(*a)'],
    ['axbayb', '+(a*b)'],
    ['foo.js', '*(*.js)'],
  ]) {
    assert(picomatch.isMatch(value, pattern), `${pattern} no longer matches ${value}`)
  }
  assert(!picomatch.isMatch('foo.ts', '*(*.js)'))
}
console.info('Verified picomatch backport for GHSA-fc5q-39xc-vjpf before the advisory exception')
