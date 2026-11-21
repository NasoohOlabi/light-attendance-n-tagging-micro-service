import Fuse from 'fuse.js'

function normalize(value: string) {
  return value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[أإآٱ]/g, 'ا')
    .toLocaleLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

function options(term: string) {
  return { ignoreLocation: true, threshold: term.length < 3 ? 0 : 0.34 }
}

export function matchesText(value: string, query: string): boolean {
  const term = normalize(query)
  if (!term) return true
  return Fuse.match(term, normalize(value), options(term)).isMatch
}

export function rankStudents<T extends { name: string }>(students: T[], query: string): T[] {
  const term = normalize(query)
  if (!term) return students
  const entries = students.map((student) => ({ student, name: normalize(student.name) }))
  return new Fuse(entries, { ...options(term), keys: ['name'] })
    .search(term)
    .map(({ item }) => item.student)
}
