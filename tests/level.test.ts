import { describe, expect, test } from 'bun:test'
import { formatLevel } from '../src/levelFormat'

describe('level display', () => {
  test('removes zero-only decimals without changing other labels', () => {
    expect(['1.0', '2.00', '1.25', 'Level 1.0', ''].map(formatLevel)).toEqual([
      '1',
      '2',
      '1.25',
      'Level 1.0',
      '',
    ])
  })
})
