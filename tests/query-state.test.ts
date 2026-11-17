import { expect, test } from 'bun:test'
import { sanitizedSearch } from '../src/queryState'

test('view URLs discard unknown parameters including bearer credentials', () => {
  expect(sanitizedSearch('?tab=notes&token=secret&access=private&tag=review').toString()).toBe(
    'tab=notes&tag=review',
  )
})

test('account destinations survive URL sanitization', () => {
  expect(
    sanitizedSearch('?page=app&view=settings&account=auth%2Fsubject&token=secret').toString(),
  ).toBe('page=app&view=settings&account=auth%2Fsubject')
})
