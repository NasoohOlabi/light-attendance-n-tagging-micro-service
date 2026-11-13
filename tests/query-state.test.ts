import { expect, test } from 'bun:test'
import { sanitizedSearch } from '../src/queryState'

test('view URLs discard unknown parameters including bearer credentials', () => {
  expect(sanitizedSearch('?tab=notes&token=secret&access=private&tag=review').toString()).toBe(
    'tab=notes&tag=review',
  )
})
