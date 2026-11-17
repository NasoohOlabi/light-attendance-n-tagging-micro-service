import { expect, test } from 'bun:test'
import { reviewAudit } from '../scripts/audit'

const url = 'https://github.com/advisories/GHSA-fc5q-39xc-vjpf'
const beforeExpiry = Date.parse('2026-11-17T00:00:00Z')

test('a clean audit needs no exception, including after its expiry', () => {
  expect(reviewAudit({}, Date.parse('2026-12-02T00:00:00Z'))).toBe(0)
})

test('only the exact reviewed picomatch advisory is eligible for the production check', () => {
  expect(reviewAudit({ picomatch: [{ url, severity: 'high' }] }, beforeExpiry)).toBe(1)
  expect(() => reviewAudit({ another: [{ url }] }, beforeExpiry)).toThrow('Unreviewed')
  expect(() =>
    reviewAudit({ picomatch: [{ url: 'https://github.com/advisories/another' }] }, beforeExpiry),
  ).toThrow('Unreviewed')
})

test('the exception fails at its expiry boundary', () => {
  expect(() => reviewAudit({ picomatch: [{ url }] }, Date.parse('2026-12-01T00:00:00Z'))).toThrow(
    'expired',
  )
})

test('malformed audit reports fail closed', () => {
  for (const report of [null, [], { picomatch: [{}] }, { error: 'unavailable' }])
    expect(() => reviewAudit(report, beforeExpiry)).toThrow()
})
