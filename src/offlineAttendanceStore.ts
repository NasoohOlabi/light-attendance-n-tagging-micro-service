import { z } from 'zod'
import { statusSchema } from '../shared/ledger'
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
    const request = indexedDB.open('halaqa-offline-attendance', 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore('rosters')
      request.result.createObjectStore('pending')
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('Offline storage is blocked by another tab.'))
  })
}

async function transaction<T>(
  store: 'rosters' | 'pending',
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

function rosterKey(userId: string, courseId: string, date: string) {
  return JSON.stringify([userId, courseId, date])
}
function queueKey(userId: string) {
  return userId
}

export async function savePreparedRoster(userId: string, roster: PreparedRoster) {
  const value = preparedRosterSchema.parse(roster)
  await transaction<void>('rosters', 'readwrite', (store, done) => {
    store.put(value, rosterKey(userId, value.courseId, value.date))
    done()
  })
}
export async function getPreparedRoster(
  userId: string,
  courseId: string,
  date: string,
): Promise<PreparedRoster | null> {
  return transaction('rosters', 'readonly', (store, done) => {
    const request = store.get(rosterKey(userId, courseId, date))
    request.onsuccess = () =>
      done(request.result === undefined ? null : preparedRosterSchema.parse(request.result))
  })
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
        [...queue, { ...value, expectedEventId: previous?.event.id ?? value.expectedEventId }],
        queueKey(userId),
      )
      done()
    }
  })
}
export async function recordAttendanceOutcome(userId: string, outcome: AttendanceOutcome) {
  const db = await openDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['pending', 'rosters'], 'readwrite')
      const pending = tx.objectStore('pending')
      const request = pending.get(queueKey(userId))
      request.onsuccess = () => {
        const queue = z.array(pendingSchema).parse(request.result ?? [])
        const item = queue.find((entry) => entry.event.id === outcome.id)
        if (!item) return
        if (outcome.kind === 'saved' || outcome.kind === 'unchanged') {
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
        const tx = db.transaction(['pending', 'rosters'], 'readwrite')
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
                    outcome: null,
                  },
                ]
              : []
          pending.put(
            [...fresh.filter((item) => attendanceKey(item) !== key), ...replacement],
            queueKey(userId),
          )
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
  })
}
