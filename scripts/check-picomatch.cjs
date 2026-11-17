const assert = require('node:assert/strict')
const { createRequire } = require('node:module')

for (const owner of ['vite', 'lint-staged', 'tinyglobby']) {
  const ownerRequire = createRequire(require.resolve(owner))
  const picomatch = ownerRequire('picomatch')
  assert.equal(ownerRequire('picomatch/package.json').version, '4.0.7')
  for (const pattern of ['+(*)', '+(*a)', '*(*)', '*(*a)', '**/+(*a).ts', '+(*?a)', '+(*(a))']) {
    for (const options of [
      {},
      { fastpaths: false },
      { windows: true },
      { maxExtglobRecursion: false },
    ]) {
      assert.throws(() => picomatch(pattern, options), /Repeated extglobs disabled/)
      assert.throws(() => picomatch.makeRe(pattern, options), /Repeated extglobs disabled/)
      assert.throws(() => picomatch.parse(pattern, options), /Repeated extglobs disabled/)
    }
  }
  assert.equal(picomatch('src/**/*.{ts,tsx}')('src/App.tsx'), true)
  assert.equal(picomatch('src/**/*.{ts,tsx}')('src/app.css'), false)
  assert.equal(picomatch('!(*.test).ts')('app.ts'), true)
  assert.equal(picomatch('!(*.test).ts')('app.test.ts'), false)
  assert.equal(picomatch('@(*.js|*.ts)')('app.ts'), true)
}
console.log(
  'Verified patched picomatch for Vite, lint-staged and tinyglobby: repeated extglobs fail closed; normal globs work. Temporary audit exception: GHSA-fc5q-39xc-vjpf only.',
)
