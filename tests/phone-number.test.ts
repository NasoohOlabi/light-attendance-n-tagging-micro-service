import { expect, test } from 'bun:test'
import { phoneNumber } from '../src/phoneFormat'

test('formats and dials staff phone values conservatively', () => {
  expect(phoneNumber('0912345678')).toEqual({ display: '0912 345 678', href: 'tel:0912345678' })
  expect(phoneNumber('09 12-345-678')).toEqual({ display: '0912 345 678', href: 'tel:0912345678' })
  expect(phoneNumber('0912 345 678')).toEqual({ display: '0912 345 678', href: 'tel:0912345678' })
  expect(phoneNumber('963912345678')).toEqual({
    display: '+963 912 345 678',
    href: 'tel:+963912345678',
  })
  expect(phoneNumber('+963912345678')).toEqual({
    display: '+963 912 345 678',
    href: 'tel:+963912345678',
  })
  expect(phoneNumber('00963 912 345 678')).toEqual({
    display: '+963 912 345 678',
    href: 'tel:+963912345678',
  })
  expect(phoneNumber('(00) 963 912 345 678')).toEqual({
    display: '+963 912 345 678',
    href: 'tel:+963912345678',
  })
  expect(phoneNumber('00901234567890123')).toEqual({
    display: '+901234567890123',
    href: 'tel:+901234567890123',
  })
  expect(phoneNumber('90 555 010 1234')).toEqual({
    display: '+90 555 010 1234',
    href: 'tel:+905550101234',
  })
  expect(phoneNumber('+012345')).toEqual({ display: '+012345', href: null })
  expect(phoneNumber('000123456789')).toEqual({ display: '000123456789', href: null })
  expect(phoneNumber('0111234567')).toEqual({ display: '0111234567', href: 'tel:0111234567' })
  expect(phoneNumber('1234567890')).toEqual({ display: '1234567890', href: 'tel:1234567890' })
  expect(phoneNumber('1234567890123456')).toEqual({ display: '1234567890123456', href: null })
  expect(phoneNumber('1234567')).toEqual({ display: '1234567', href: 'tel:1234567' })
  expect(phoneNumber('')).toEqual({ display: '', href: null })
  expect(phoneNumber('invalid 123')).toEqual({ display: 'invalid 123', href: null })
})
