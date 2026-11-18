function normalize(value: string) {
  return value.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase().trim()
}

function score(name: string, query: string) {
  const index = name.indexOf(query)
  if (index >= 0) return index
  let position = 0
  for (const letter of name) if (letter === query[position]) position++
  return position === query.length ? 100 + name.length : Infinity
}

export function rankStudents<T extends { name: string }>(students: T[], query: string): T[] {
  const term = normalize(query)
  if (!term) return students
  return students
    .map((student) => ({ student, score: score(normalize(student.name), term) }))
    .filter((entry) => Number.isFinite(entry.score))
    .sort((a, b) => a.score - b.score || a.student.name.localeCompare(b.student.name))
    .map(({ student }) => student)
}
