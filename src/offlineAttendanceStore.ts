import { z } from 'zod'
import { projectEvents, statusSchema } from '../shared/ledger'
import type { NeonSnapshot } from '../shared/neon'
import {
  offlineStudentOperationSchema,
  offlineStudentOutcomeSchema,
} from '../shared/offlineStudent'
import {
  offlineAttendanceOutcomeSchema,
  offlineAttendanceRecordSchema,
  offlineAttendanceResponseSchema,
} from '../shared/offlineAttendance'

const revisionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('unknown') }),
  z.object({
    kind: z.literal('confirmed'),
    eventId: z.uuid().nullable(),
    status: statusSchema.nullable(),
  }),
])
export const preparedRosterSchema = z.object({
  courseId: z.uuid(),
  courseName: z.string(),
  date: z.iso.date(),
  students: z.array(
    z.object({
      studentId: z.uuid(),
      enrollmentId: z.uuid(),
      name: z.string(),
      group: z.string(),
      level: z.string(),
      revision: revisionSchema,
    }),
  ),
})
export type PreparedRoster = z.infer<typeof preparedRosterSchema>

export const syncResponseSchema = offlineAttendanceResponseSchema
export type AttendanceOutcome = z.infer<typeof offlineAttendanceOutcomeSchema>
const pendingSchema = offlineAttendanceRecordSchema.extend({
  outcome: offlineAttendanceOutcomeSchema.nullable(),
})
export type PendingAttendance = z.infer<typeof pendingSchema>

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('halaqa-offline-attendance', 2)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('rosters'))
        request.result.createObjectStore('rosters')
      if (!request.result.objectStoreNames.contains('pending'))
        request.result.createObjectStore('pending')
      if (!request.result.objectStoreNames.contains('snapshots'))
        request.result.createObjectStore('snapshots')
      if (!request.result.objectStoreNames.contains('studentPending'))
        request.result.createObjectStore('studentPending')
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('Offline storage is blocked by another tab.'))
  })
}

async function transaction<T>(
  store: 'rosters' | 'pending' | 'snapshots' | 'studentPending',
  mode: IDBTransactionMode,
  run: (object: IDBObjectStore, done: (value: T) => void) => void,
): Promise<T> {
  const db = await openDatabase()
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(store, mode)
      let result: T
      run(tx.objectStore(store), (value) => {
        result = value
      })
      tx.oncomplete = () => resolve(result)
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error ?? new Error('Offline storage transaction aborted.'))
    })
  } finally {
    db.close()
  }
}

function queueKey(userId: string) {
  return userId
}

const queueChangeEvent = 'halaqa-offline-queue-change'

function notifyQueueChanged() {
  window.dispatchEvent(new Event(queueChangeEvent))
  try {
    localStorage.setItem(queueChangeEvent, crypto.randomUUID())
  } catch {
    // The committed change is still visible in this tab.
  }
}

export function subscribeOfflineQueue(refresh: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === queueChangeEvent) refresh()
  }
  window.addEventListener(queueChangeEvent, refresh)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(queueChangeEvent, refresh)
    window.removeEventListener('storage', onStorage)
  }
}

export async function listPreparedRosters(userId: string): Promise<PreparedRoster[]> {
  return transaction('rosters', 'readonly', (store, done) => {
    const values: PreparedRoster[] = []
    const request = store.openCursor()
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) {
        done(values)
        return
      }
      if (typeof cursor.key === 'string') {
        const key: unknown = JSON.parse(cursor.key)
        if (Array.isArray(key) && key[0] === userId)
          values.push(preparedRosterSchema.parse(cursor.value))
      }
      cursor.continue()
    }
  })
}
export async function listPendingAttendance(userId: string): Promise<PendingAttendance[]> {
  return transaction('pending', 'readonly', (store, done) => {
    const request = store.get(queueKey(userId))
    request.onsuccess = () => done(z.array(pendingSchema).parse(request.result ?? []))
  })
}
export function attendanceKey(item: PendingAttendance) {
  const payload = item.event.payload
  return JSON.stringify([payload.studentId, payload.enrollmentId, payload.date])
}
export async function queueAttendance(userId: string, entry: Omit<PendingAttendance, 'outcome'>) {
  const value = pendingSchema.parse({ ...entry, outcome: null })
  await transaction<void>('pending', 'readwrite', (store, done) => {
    const request = store.get(queueKey(userId))
    request.onsuccess = () => {
      const queue = z.array(pendingSchema).parse(request.result ?? [])
      const previous = queue.findLast((item) => attendanceKey(item) === attendanceKey(value))
      store.put(
        [
          ...queue,
          {
            ...value,
            expectedEventId: previous?.event.id ?? value.expectedEventId,
            ...(previous ? { expectedRevision: undefined } : {}),
          },
        ],
        queueKey(userId),
      )
      done()
    }
  })
  notifyQueueChanged()
}
export async function recordAttendanceOutcome(userId: string, outcome: AttendanceOutcome) {
  const db = await openDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['pending', 'rosters', 'snapshots'], 'readwrite')
      const pending = tx.objectStore('pending')
      const request = pending.get(queueKey(userId))
      request.onsuccess = () => {
        const queue = z.array(pendingSchema).parse(request.result ?? [])
        const item = queue.find((entry) => entry.event.id === outcome.id)
        if (!item) return
        if (outcome.kind === 'saved' || outcome.kind === 'unchanged') {
          const snapshotRequest = tx.objectStore('snapshots').get(userId)
          snapshotRequest.onsuccess = () => {
            if (snapshotRequest.result === undefined) return
            const snapshot = offlineSnapshotSchema.parse(snapshotRequest.result)
            const payload = item.event.payload
            snapshot.attendance = snapshot.attendance.filter(
              (entry) =>
                !(
                  entry.studentId === payload.studentId &&
                  entry.enrollmentId === payload.enrollmentId &&
                  entry.date === payload.date
                ),
            )
            if (outcome.current)
              snapshot.attendance.push({
                studentId: payload.studentId,
                enrollmentId: payload.enrollmentId,
                date: payload.date,
                ...outcome.current,
              })
            tx.objectStore('snapshots').put(snapshot, userId)
          }
          const cursorRequest = tx.objectStore('rosters').openCursor()
          cursorRequest.onsuccess = () => {
            const cursor = cursorRequest.result
            if (!cursor) return
            if (typeof cursor.key === 'string') {
              const key: unknown = JSON.parse(cursor.key)
              const roster = preparedRosterSchema.parse(cursor.value)
              if (
                Array.isArray(key) &&
                key[0] === userId &&
                roster.date === item.event.payload.date
              ) {
                const students = roster.students.map((student) =>
                  student.enrollmentId === item.event.payload.enrollmentId
                    ? {
                        ...student,
                        revision: {
                          kind: 'confirmed' as const,
                          eventId: outcome.current?.eventId ?? null,
                          status: outcome.current?.status ?? null,
                        },
                      }
                    : student,
                )
                cursor.update({ ...roster, students })
              }
            }
            cursor.continue()
          }
        }
        pending.put(
          queue.flatMap((entry) =>
            entry.event.id !== outcome.id
              ? [entry]
              : outcome.kind === 'saved' || outcome.kind === 'unchanged'
                ? []
                : [{ ...entry, outcome }],
          ),
          queueKey(userId),
        )
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error ?? new Error('Offline storage transaction aborted.'))
    })
  } finally {
    db.close()
  }
  notifyQueueChanged()
}

export async function resolveAttendanceConflict(
  userId: string,
  id: string,
  choice: 'server' | 'local',
) {
  if (!navigator.locks)
    throw new Error('This browser cannot safely coordinate offline sync between tabs.')
  return navigator.locks.request(`halaqa-offline-sync:${userId}`, async () => {
    const queue = await listPendingAttendance(userId)
    const conflict = queue.find((item) => item.event.id === id && item.outcome?.kind === 'conflict')
    if (!conflict || !conflict.outcome) throw new Error('This conflict is no longer available.')
    const key = attendanceKey(conflict)
    const chain = queue.filter((item) => attendanceKey(item) === key)
    const latest = chain.at(-1)
    if (!latest) throw new Error('This conflict is no longer available.')
    const current = conflict.outcome.current
    const db = await openDatabase()
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['pending', 'rosters', 'snapshots'], 'readwrite')
        const pending = tx.objectStore('pending')
        const get = pending.get(queueKey(userId))
        get.onsuccess = () => {
          const fresh = z.array(pendingSchema).parse(get.result ?? [])
          const freshChain = fresh.filter((item) => attendanceKey(item) === key)
          if (JSON.stringify(freshChain) !== JSON.stringify(chain)) {
            tx.abort()
            return
          }
          const replacement =
            choice === 'local'
              ? [
                  {
                    ...latest,
                    event: {
                      ...latest.event,
                      id: crypto.randomUUID(),
                      clientTime: new Date().toISOString(),
                    },
                    expectedEventId: current?.eventId ?? null,
                    expectedRevision: undefined,
                    outcome: null,
                  },
                ]
              : []
          pending.put(
            [...fresh.filter((item) => attendanceKey(item) !== key), ...replacement],
            queueKey(userId),
          )
          const snapshotRequest = tx.objectStore('snapshots').get(userId)
          snapshotRequest.onsuccess = () => {
            if (snapshotRequest.result === undefined) return
            const snapshot = offlineSnapshotSchema.parse(snapshotRequest.result)
            const payload = latest.event.payload
            snapshot.attendance = snapshot.attendance.filter(
              (entry) =>
                !(
                  entry.studentId === payload.studentId &&
                  entry.enrollmentId === payload.enrollmentId &&
                  entry.date === payload.date
                ),
            )
            if (current)
              snapshot.attendance.push({
                studentId: payload.studentId,
                enrollmentId: payload.enrollmentId,
                date: payload.date,
                ...current,
              })
            tx.objectStore('snapshots').put(snapshot, userId)
          }
          const cursorRequest = tx.objectStore('rosters').openCursor()
          cursorRequest.onsuccess = () => {
            const cursor = cursorRequest.result
            if (!cursor) return
            if (typeof cursor.key === 'string') {
              const rosterKeyValue: unknown = JSON.parse(cursor.key)
              const roster = preparedRosterSchema.parse(cursor.value)
              if (
                Array.isArray(rosterKeyValue) &&
                rosterKeyValue[0] === userId &&
                roster.date === latest.event.payload.date
              ) {
                cursor.update({
                  ...roster,
                  students: roster.students.map((student) =>
                    student.enrollmentId === latest.event.payload.enrollmentId
                      ? {
                          ...student,
                          revision: {
                            kind: 'confirmed',
                            eventId: current?.eventId ?? null,
                            status: current?.status ?? null,
                          },
                        }
                      : student,
                  ),
                })
              }
            }
            cursor.continue()
          }
        }
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
        tx.onabort = () =>
          reject(tx.error ?? new Error('The pending attendance changed. Reload and try again.'))
      })
    } finally {
      db.close()
    }
    notifyQueueChanged()
  })
}

const offlineSnapshotSchema = z.object({
  students: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      group: z.string(),
      level: z.string(),
      phone: z.string().nullable(),
    }),
  ),
  courses: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      enrollments: z.array(z.object({ id: z.uuid(), studentId: z.uuid(), level: z.string() })),
    }),
  ),
  attendance: z.array(
    z.object({
      studentId: z.uuid(),
      enrollmentId: z.uuid().optional(),
      date: z.iso.date(),
      eventId: z.uuid(),
      status: statusSchema,
    }),
  ),
  notes: z.array(
    z.object({
      id: z.uuid(),
      studentId: z.string(),
      date: z.iso.date(),
      text: z.string(),
      tags: z.array(z.string()),
    }),
  ),
})
export type OfflineSnapshot = z.infer<typeof offlineSnapshotSchema>

export async function getOfflineSnapshot(userId: string): Promise<OfflineSnapshot | null> {
  return transaction('snapshots', 'readonly', (store, done) => {
    const request = store.get(userId)
    request.onsuccess = () =>
      done(request.result === undefined ? null : offlineSnapshotSchema.parse(request.result))
  })
}

export async function cacheOfflineRoster(
  userId: string,
  input: Pick<NeonSnapshot, 'students' | 'courses' | 'enrollments' | 'events'>,
) {
  const students = input.students.filter((student) => student.active)
  const studentIds = new Set(students.map((student) => student.studentId))
  const enrollments = input.enrollments.filter(
    (item) => item.active && studentIds.has(item.studentId),
  )
  const projected = projectEvents(input.events)
  const snapshot = offlineSnapshotSchema.parse({
    students: students.map((student) => ({
      id: student.studentId,
      name: student.name,
      group: student.group,
      level: enrollments.find((item) => item.studentId === student.studentId)?.level ?? '',
      phone: student.whatsapp || null,
    })),
    courses: input.courses
      .filter((course) => course.open)
      .map((course) => ({
        id: course.id,
        name: course.name,
        enrollments: enrollments
          .filter((item) => item.courseId === course.id)
          .map((item) => ({ id: item.id, studentId: item.studentId, level: item.level })),
      })),
    attendance: projected.attendance
      .filter(({ value }) => studentIds.has(value.studentId))
      .map(({ event, value }) => ({ ...value, eventId: event.id })),
    notes: projected.notes
      .filter(({ value }) => studentIds.has(value.studentId))
      .map(({ event, value }) => ({ ...value, id: event.id })),
  })
  const db = await openDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['snapshots', 'rosters'], 'readwrite')
      tx.objectStore('snapshots').put(snapshot, userId)
      const cursorRequest = tx.objectStore('rosters').openCursor()
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result
        if (!cursor) return
        if (typeof cursor.key === 'string') {
          const key: unknown = JSON.parse(cursor.key)
          if (Array.isArray(key) && key[0] === userId) cursor.delete()
        }
        cursor.continue()
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error ?? new Error('Offline storage transaction aborted.'))
    })
  } finally {
    db.close()
  }
}

const pendingStudentSchema = z.object({
  operation: offlineStudentOperationSchema,
  outcome: offlineStudentOutcomeSchema.nullable(),
})
export type PendingStudent = z.infer<typeof pendingStudentSchema>
export type StudentOperation = z.infer<typeof offlineStudentOperationSchema>
export type StudentOutcome = z.infer<typeof offlineStudentOutcomeSchema>
export function studentOperationId(operation: StudentOperation) {
  return operation.kind === 'note' ? operation.event.id : operation.id
}
export async function listPendingStudent(userId: string): Promise<PendingStudent[]> {
  return transaction('studentPending', 'readonly', (store, done) => {
    const request = store.get(userId)
    request.onsuccess = () => done(z.array(pendingStudentSchema).parse(request.result ?? []))
  })
}
export async function queueStudentOperation(userId: string, operation: StudentOperation) {
  const value = pendingStudentSchema.parse({ operation, outcome: null })
  await transaction<void>('studentPending', 'readwrite', (store, done) => {
    const request = store.get(userId)
    request.onsuccess = () => {
      const queue = z.array(pendingStudentSchema).parse(request.result ?? [])
      const studentId = value.operation.kind === 'contact' ? value.operation.studentId : null
      const previous = studentId
        ? queue.findLast(
            (entry) =>
              entry.operation.kind === 'contact' && entry.operation.studentId === studentId,
          )
        : undefined
      const operation =
        value.operation.kind === 'contact' && previous?.operation.kind === 'contact'
          ? { ...value.operation, expectedWhatsapp: previous.operation.whatsapp }
          : value.operation
      store.put([...queue, { ...value, operation }], userId)
      done()
    }
  })
  notifyQueueChanged()
}
export async function recordStudentOutcome(userId: string, outcome: StudentOutcome) {
  const db = await openDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['studentPending', 'snapshots'], 'readwrite')
      const pending = tx.objectStore('studentPending')
      const request = pending.get(userId)
      request.onsuccess = () => {
        const queue = z.array(pendingStudentSchema).parse(request.result ?? [])
        const item = queue.find((entry) => studentOperationId(entry.operation) === outcome.id)
        if (!item) return
        pending.put(
          queue.flatMap((entry) =>
            studentOperationId(entry.operation) !== outcome.id
              ? [entry]
              : outcome.kind === 'saved'
                ? []
                : [{ ...entry, outcome }],
          ),
          userId,
        )
        if (outcome.kind !== 'saved') return
        const snapshotRequest = tx.objectStore('snapshots').get(userId)
        snapshotRequest.onsuccess = () => {
          if (snapshotRequest.result === undefined) return
          const snapshot = offlineSnapshotSchema.parse(snapshotRequest.result)
          const operation = item.operation
          if (operation.kind === 'contact') {
            snapshot.students = snapshot.students.map((student) =>
              student.id === operation.studentId
                ? { ...student, phone: outcome.currentWhatsapp }
                : student,
            )
          } else if (
            !snapshot.notes.some((note) => note.id === operation.event.id) &&
            snapshot.students.some((student) => student.id === operation.event.payload.studentId)
          ) {
            snapshot.notes.push({ ...operation.event.payload, id: operation.event.id })
          }
          tx.objectStore('snapshots').put(snapshot, userId)
        }
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error ?? new Error('Offline storage transaction aborted.'))
    })
  } finally {
    db.close()
  }
  notifyQueueChanged()
}
export async function resolveStudentConflict(
  userId: string,
  id: string,
  choice: 'server' | 'local',
) {
  if (!navigator.locks)
    throw new Error('This browser cannot safely coordinate offline sync between tabs.')
  return navigator.locks.request(`halaqa-offline-student-sync:${userId}`, async () => {
    const db = await openDatabase()
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['studentPending', 'snapshots'], 'readwrite')
        const pending = tx.objectStore('studentPending')
        const request = pending.get(userId)
        request.onsuccess = () => {
          const queue = z.array(pendingStudentSchema).parse(request.result ?? [])
          const item = queue.find(
            (entry) =>
              studentOperationId(entry.operation) === id && entry.outcome?.kind === 'conflict',
          )
          if (!item || item.operation.kind !== 'contact' || !item.outcome) {
            tx.abort()
            return
          }
          const studentId = item.operation.studentId
          const chain = queue.filter(
            (entry) =>
              entry.operation.kind === 'contact' && entry.operation.studentId === studentId,
          )
          const latest = chain.at(-1)?.operation
          if (!latest || latest.kind !== 'contact') {
            tx.abort()
            return
          }
          const current = item.outcome.currentWhatsapp
          const replacement =
            choice === 'local'
              ? [
                  {
                    operation: {
                      ...latest,
                      id: crypto.randomUUID(),
                      clientTime: new Date().toISOString(),
                      expectedWhatsapp: current,
                    },
                    outcome: null,
                  },
                ]
              : []
          pending.put(
            [
              ...queue.filter(
                (entry) =>
                  !(entry.operation.kind === 'contact' && entry.operation.studentId === studentId),
              ),
              ...replacement,
            ],
            userId,
          )
          const snapshotRequest = tx.objectStore('snapshots').get(userId)
          snapshotRequest.onsuccess = () => {
            if (snapshotRequest.result === undefined) return
            const snapshot = offlineSnapshotSchema.parse(snapshotRequest.result)
            snapshot.students = snapshot.students.map((student) =>
              student.id === studentId ? { ...student, phone: current } : student,
            )
            tx.objectStore('snapshots').put(snapshot, userId)
          }
        }
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
        tx.onabort = () =>
          reject(tx.error ?? new Error('The pending contact changed. Reload and try again.'))
      })
    } finally {
      db.close()
    }
    notifyQueueChanged()
  })
}
