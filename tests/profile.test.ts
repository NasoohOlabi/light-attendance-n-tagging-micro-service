import { describe, expect, test } from 'bun:test'
import { validProfileRequest, validProfileUpdate, validSignupRequest } from '../server/profile'

describe('profile boundary', () => {
  const jpeg = `data:image/jpeg;base64,${Buffer.from([255, 216, 255, 224, 255, 217]).toString('base64')}`
  test('accepts a bounded own-profile name and image or removal', () => {
    expect(validProfileUpdate({ name: 'User', image: jpeg })).toBe(true)
    expect(validProfileUpdate({ name: 'User', image: null })).toBe(true)
    expect(validProfileUpdate({ name: 'User' })).toBe(true)
    expect(validProfileUpdate({ name: ' ', image: null })).toBe(false)
  })
  test('rejects foreign fields, invalid media and oversized payloads', async () => {
    for (const image of [
      'https://example.test/a.png',
      'data:image/svg+xml;base64,PHN2Zz4=',
      'data:image/jpeg;base64,SGVsbG8=',
      `data:image/jpeg;base64,${'A'.repeat(120_000)}`,
    ])
      expect(validProfileUpdate({ name: 'User', image })).toBe(false)
    expect(validProfileUpdate({ name: 'User', image: null, role: 'administrator' })).toBe(false)
    expect(
      await validProfileRequest(
        new Request('http://localhost/api/auth/update-user', {
          method: 'POST',
          body: 'a'.repeat(122_000),
        }),
      ),
    ).toBeNull()
  })
  test('does not allow image injection through signup in JSON or forms', async () => {
    const request = (body: string, type: string) =>
      new Request('http://localhost/api/auth/sign-up/email', {
        method: 'POST',
        headers: { 'Content-Type': type },
        body,
      })
    expect(await validSignupRequest(request('{"name":"User"}', 'application/json'))).toBe(
      '{"name":"User"}',
    )
    expect(
      await validSignupRequest(request('{"image":"https://example.test/a"}', 'application/json')),
    ).toBeNull()
    expect(
      await validSignupRequest(request('name=User&image=x', 'application/x-www-form-urlencoded')),
    ).toBeNull()
  })
})
