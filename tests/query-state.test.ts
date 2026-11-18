import { expect, test } from 'bun:test'
import { sanitizedSearch } from '../src/queryState'

test('view URLs discard unknown parameters including bearer credentials', () => {
  expect(sanitizedSearch('?tab=attendance&token=secret&access=private').toString()).toBe(
    'tab=attendance',
  )
})

test('legacy Notes bookmarks open attendance with the same date and course', () => {
  const course = '40000000-0000-4000-8000-000000000001'
  const search = sanitizedSearch(`?page=app&tab=notes&date=2026-11-18&course=${course}&tag=review`)
  expect(search.toString()).toBe(`page=app&tab=attendance&date=2026-11-18&course=${course}`)
})

test('account destinations survive URL sanitization', () => {
  expect(
    sanitizedSearch('?page=app&view=settings&account=auth%2Fsubject&token=secret').toString(),
  ).toBe('page=app&view=settings&account=auth%2Fsubject')
})
