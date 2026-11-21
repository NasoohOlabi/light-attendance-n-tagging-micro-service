import { describe, expect, test } from 'bun:test'
import {
  invitationProfileInputSchema,
  invitationRequestSchema,
  phoneSchema,
} from '../shared/invitations'

describe('invitation boundaries', () => {
  test('normalizes supported phone spellings to a single sign-in identity', () => {
    for (const phone of [
      '0912 345 678',
      '00963 912-345-678',
      '+963 (912) 345 678',
      '\u0660\u0669\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668',
    ]) {
      expect(phoneSchema.parse(phone)).toBe('+963912345678')
    }
    expect(phoneSchema.safeParse('+0 912 345 678').success).toBe(false)
    expect(phoneSchema.safeParse('0912 345').success).toBe(false)
  })

  test('limits batches and accepts only named roles', () => {
    const person = {
      firstName: 'A',
      lastName: 'B',
      role: 'student',
      phone: '+12025550100',
      phoneConfirmed: true,
    }
    const requestId = crypto.randomUUID()
    expect(invitationRequestSchema.safeParse({ requestId, people: [person] }).success).toBe(true)
    expect(
      invitationRequestSchema.safeParse({
        requestId,
        people: [{ ...person, phoneConfirmed: false }],
      }).success,
    ).toBe(false)
    expect(
      invitationRequestSchema.safeParse({ requestId, people: [{ ...person, phone: '1' }] }).success,
    ).toBe(false)
    expect(
      invitationRequestSchema.safeParse({ requestId, people: Array(51).fill(person) }).success,
    ).toBe(false)
    expect(
      invitationRequestSchema.safeParse({ requestId, people: [{ ...person, role: 'owner' }] })
        .success,
    ).toBe(false)
  })
  test('validates invitation profile fields', () => {
    const profile = {
      phone: '12345678',
      birthDate: '2000-01-01',
      currentPassword: 'temporary',
      newPassword: 'replacement',
    }
    expect(invitationProfileInputSchema.parse(profile).phone).toBe('12345678')
    expect(
      invitationProfileInputSchema.safeParse({ ...profile, birthDate: '2000-02-31' }).success,
    ).toBe(false)
    expect(
      invitationProfileInputSchema.safeParse({ ...profile, username: 'not valid' }).success,
    ).toBe(false)
  })
})
