import { expect, test } from 'bun:test'
import { unzipSync, strFromU8 } from 'fflate'
import { courseWorkbook, courseExportRows, type CourseExportOptions } from '../src/courseExport'
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
  const input = {
    course,
    entries: [entry, other, noRecords],
    students: [
      { studentId, name: '=Student', firstName: '=Student', lastName: 'عربي' },
      { studentId: noRecords.studentId, name: 'Legacy Student', firstName: '', lastName: '' },
    ],
    attendance: projectEvents([first, correction, present, absent, excused, foreign]).attendance,
    ar: false,
  }
  const qualifying = courseExportRows({
    ...input,
    options: { report: 'students', result: 'pass', coverage: 'theory', enrollment: 'withdrawn' },
  })
  expect(qualifying.map((row) => row.firstName)).toEqual(['Legacy Student'])
  const blob = await courseWorkbook(input)
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

test('focused reports filter saved scores and export projected daily attendance', async () => {
  const course = courseSchema.parse({ id: crypto.randomUUID(), name: 'Synthetic course' })
  const otherCourse = courseSchema.parse({ id: crypto.randomUUID(), name: 'Other' })
  const first = enrollmentSchema.parse({
    id: crypto.randomUUID(),
    courseId: course.id,
    studentId: crypto.randomUUID(),
    level: '',
    theory: 0,
    practical: null,
  })
  const second = enrollmentSchema.parse({
    id: crypto.randomUUID(),
    courseId: course.id,
    studentId: crypto.randomUUID(),
    level: '2',
    active: false,
    theory: null,
    practical: null,
  })
  const foreign = enrollmentSchema.parse({
    ...first,
    id: crypto.randomUUID(),
    courseId: otherCourse.id,
  })
  const old = makeEvent('test', {
    kind: 'attendance',
    studentId: first.studentId,
    enrollmentId: first.id,
    date: '2026-01-01',
    status: 'absent',
  })
  const correction = makeEvent('test', { kind: 'reversal', targetId: old.id, reason: 'correction' })
  const corrected = makeEvent('test', {
    kind: 'attendance',
    studentId: first.studentId,
    enrollmentId: first.id,
    date: '2026-01-01',
    status: 'late',
  })
  const later = makeEvent('test', {
    kind: 'attendance',
    studentId: first.studentId,
    enrollmentId: first.id,
    date: '2026-01-02',
    status: 'excused',
  })
  const other = makeEvent('test', {
    kind: 'attendance',
    studentId: first.studentId,
    enrollmentId: foreign.id,
    date: '2026-01-01',
    status: 'absent',
  })
  const input = {
    course,
    entries: [first, second, foreign],
    students: [
      {
        studentId: first.studentId,
        name: 'First',
        firstName: 'First',
        lastName: '',
        whatsapp: 'private contact',
        location: 'private location',
        birthYear: 2000,
      },
      { studentId: second.studentId, name: 'Second', firstName: 'Second', lastName: '' },
    ],
    attendance: projectEvents([old, correction, corrected, later, other]).attendance,
    ar: false,
  }
  expect(
    courseExportRows({ ...input, options: { report: 'participants' } }).map((row) => row.theory),
  ).toEqual([0])
  expect(
    courseExportRows({ ...input, options: { report: 'grades', coverage: 'none' } }).map(
      (row) => row.firstName,
    ),
  ).toEqual(['Second'])
  expect(
    courseExportRows({ ...input, options: { report: 'grades', coverage: 'both' } }),
  ).toHaveLength(0)
  expect(
    courseExportRows({ ...input, options: { report: 'grades', enrollment: 'withdrawn' } }).map(
      (row) => row.firstName,
    ),
  ).toEqual(['Second'])
  expect(
    courseExportRows({ ...input, options: { report: 'grades', level: '' } }).map(
      (row) => row.firstName,
    ),
  ).toEqual(['First'])
  const options: CourseExportOptions = {
    report: 'attendance',
    from: '2026-01-01',
    to: '2026-01-01',
    mark: 'present',
    columns: ['firstName', 'date', 'mark'],
  }
  const rows = courseExportRows({ ...input, options })
  expect(rows.map(({ firstName, date, mark }) => [firstName, date, mark])).toEqual([
    ['First', '2026-01-01', 'Present'],
  ])
  const archive = unzipSync(
    new Uint8Array(await (await courseWorkbook({ ...input, options })).arrayBuffer()),
  )
  const xml = Object.values(archive)
    .map((bytes) => strFromU8(bytes))
    .join('\n')
  expect(xml).toContain('2026-01-01')
  expect(xml).toContain('Present')
  expect(xml).not.toContain('2026-01-02')
  expect(xml).not.toContain('private contact')
  expect(xml).not.toContain('private location')
  for (const report of ['grades', 'students', 'attendance'] as const) {
    const focused = unzipSync(
      new Uint8Array(await (await courseWorkbook({ ...input, options: { report } })).arrayBuffer()),
    )
    const focusedXml = Object.values(focused)
      .map((bytes) => strFromU8(bytes))
      .join('\n')
    const sheet = strFromU8(focused['xl/worksheets/sheet1.xml'])
    expect(sheet).toContain('<row r="1"')
    expect(focusedXml).not.toContain('Minimum attendance %')
    expect(focusedXml).not.toContain('Theory passing grade')
    expect(focusedXml).not.toContain('Synthetic course')
    expect(focusedXml).not.toContain('private contact')
    expect(focusedXml).not.toContain('private location')
    if (report === 'grades') {
      expect(focusedXml).toContain('Theory')
      expect(focusedXml).toContain('Result')
      expect(focusedXml).not.toContain('Total recorded')
      expect(focusedXml).not.toContain('Attendance %')
      expect(focusedXml).not.toContain('Course level')
    }
    if (report === 'students' || report === 'attendance') {
      expect(focusedXml).not.toContain('Theory')
      expect(focusedXml).not.toContain('Practical')
      expect(focusedXml).not.toContain('Result')
    }
  }
  const empty = unzipSync(
    new Uint8Array(await (await courseWorkbook({ ...input, entries: [] })).arrayBuffer()),
  )
  const emptyXml = Object.values(empty)
    .map((bytes) => strFromU8(bytes))
    .join('\n')
  expect(emptyXml).toContain('Synthetic course')
  expect(emptyXml).toContain('Minimum attendance %')
  expect(emptyXml).toContain('Total recorded')
  const mixed = unzipSync(
    new Uint8Array(
      await (
        await courseWorkbook({
          ...input,
          options: { report: 'full', columns: ['firstName', 'whatsapp'] },
        })
      ).arrayBuffer(),
    ),
  )
  expect(
    Object.values(mixed)
      .map((bytes) => strFromU8(bytes))
      .join('\n'),
  ).toContain('private contact')
  const privateArchive = unzipSync(
    new Uint8Array(
      await (
        await courseWorkbook({
          ...input,
          options: {
            report: 'students',
            studentId: first.studentId,
            columns: ['firstName', 'whatsapp'],
          },
        })
      ).arrayBuffer(),
    ),
  )
  const privateXml = Object.values(privateArchive)
    .map((bytes) => strFromU8(bytes))
    .join('\n')
  expect(privateXml).toContain('private contact')
  expect(privateXml).not.toContain('private location')
  expect(privateXml).not.toContain('Second')
})
