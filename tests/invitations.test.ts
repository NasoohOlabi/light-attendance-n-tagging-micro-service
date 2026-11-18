import { describe, expect, test } from 'bun:test'
import { invitationProfileInputSchema, invitationRequestSchema } from '../shared/invitations'
import { validSignupRequest } from '../server/profile'

describe('invitation boundaries', () => {
  test('limits batches and accepts only named roles', () => {
    const person = { firstName: 'A', lastName: 'B', role: 'student' }
    const requestId = crypto.randomUUID()
    expect(invitationRequestSchema.safeParse({ requestId, people: [person] }).success).toBe(true)
    expect(
      invitationRequestSchema.safeParse({ requestId, people: Array(51).fill(person) }).success,
    ).toBe(false)
    expect(
      invitationRequestSchema.safeParse({ requestId, people: [{ ...person, role: 'owner' }] })
        .success,
    ).toBe(false)
  })
  test('validates profile fields and reserves the internal email namespace', async () => {
    const profile = {
      username: 'User.Name',
      phone: '12345678',
      birthDate: '2000-01-01',
      currentPassword: 'temporary',
      newPassword: 'replacement',
    }
    expect(invitationProfileInputSchema.parse(profile).username).toBe('user.name')
    expect(
      invitationProfileInputSchema.safeParse({ ...profile, birthDate: '2000-02-31' }).success,
    ).toBe(false)
    expect(
      invitationProfileInputSchema.safeParse({ ...profile, username: 'not valid' }).success,
    ).toBe(false)
    const request = new Request('https://example.test', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'x@invitation.invalid' }),
    })
    expect(await validSignupRequest(request)).toBeNull()
  })
})
