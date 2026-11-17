import { expect, test } from 'bun:test'
import { unzipSync, strFromU8 } from 'fflate'
import { courseWorkbook } from '../src/courseExport'
import { courseSchema, enrollmentSchema } from '../shared/neon'
import { makeEvent, projectEvents } from '../shared/ledger'

test('workbook contains projected course data and literal strings', async () => {
  const course = courseSchema.parse({ id: crypto.randomUUID(), name: '=دورة', open: false })
  const studentId = crypto.randomUUID()
  const entry = enrollmentSchema.parse({
    id: crypto.randomUUID(),
    courseId: course.id,
    studentId,
    level: '',
    active: false,
    theory: 0,
    practical: null,
  })
  const first = makeEvent('test', {
    kind: 'attendance',
    studentId,
    enrollmentId: entry.id,
    date: '2026-01-01',
    status: 'absent',
  })
  const correction = makeEvent('test', {
    kind: 'reversal',
    targetId: first.id,
    reason: 'correction',
  })
  const present = makeEvent('test', {
    kind: 'attendance',
    studentId,
    enrollmentId: entry.id,
    date: '2026-01-01',
    status: 'late',
  })
  const other = enrollmentSchema.parse({
    ...entry,
    id: crypto.randomUUID(),
    courseId: crypto.randomUUID(),
  })
  const absent = makeEvent('test', {
    kind: 'attendance',
    studentId,
    enrollmentId: entry.id,
    date: '2026-01-02',
    status: 'absent',
  })
  const excused = makeEvent('test', {
    kind: 'attendance',
    studentId,
    enrollmentId: entry.id,
    date: '2026-01-03',
    status: 'excused',
  })
  const foreign = makeEvent('test', {
    kind: 'attendance',
    studentId,
    enrollmentId: other.id,
    date: '2026-01-04',
    status: 'absent',
  })
  const noRecords = enrollmentSchema.parse({
    ...entry,
    id: crypto.randomUUID(),
    studentId: crypto.randomUUID(),
    gradeDecisions: [
      {
        requestId: crypto.randomUUID(),
        result: 'pass',
        note: 'private decision note',
        actor: 'Synthetic Admin',
        at: '2026-01-01T00:00:00.000Z',
      },
    ],
  })
  const blob = await courseWorkbook({
    course,
    entries: [entry, other, noRecords],
    students: [
      { studentId, name: '=Student', firstName: '=Student', lastName: 'عربي' },
      { studentId: noRecords.studentId, name: 'Legacy Student', firstName: '', lastName: '' },
    ],
    attendance: projectEvents([first, correction, present, absent, excused, foreign]).attendance,
    ar: false,
  })
  const archive = unzipSync(new Uint8Array(await blob.arrayBuffer()))
  const sheet = strFromU8(archive['xl/worksheets/sheet1.xml'])
  const strings = [
    ...strFromU8(archive['xl/sharedStrings.xml']).matchAll(/<si><t[^>]*>(.*?)<\/t><\/si>/g),
  ].map((match) => match[1])
  const cell = (address: string) => {
    const match = sheet.match(new RegExp(`<c r="${address}"([^>]*)><v>(.*?)</v></c>`))
    return match
      ? match[1].includes('t="s"')
        ? strings[Number(match[2])]
        : Number(match[2])
      : null
  }
  expect(
    ['A5', 'B5', 'C5', 'D5', 'E5', 'F5', 'G5', 'H5', 'I5', 'J5', 'K5', 'L5'].map(cell),
  ).toEqual(['=Student', 'عربي', null, 'No', 0, null, 1, 1, 1, 3, (1 / 3) * 100, 'Pending'])
  expect(['G6', 'H6', 'I6', 'J6', 'K6'].map(cell)).toEqual([0, 0, 0, 0, null])
  expect(cell('A6')).toBe('Legacy Student')
  expect(cell('L6')).toBe('Pass')
  expect(sheet).not.toContain('r="A7"')
  const xml = Object.values(archive)
    .map((bytes) => strFromU8(bytes))
    .join('\n')
  expect(xml).toContain('=Student')
  expect(xml).toContain('عربي')
  expect(xml).toContain('=دورة')
  expect(xml).not.toContain('<f>')
  expect(xml).not.toContain('private decision note')
  expect(xml).toContain('Pending')
  expect(xml).toContain('Total recorded')
})
