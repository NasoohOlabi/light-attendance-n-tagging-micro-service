import { offlineStudentOutcomeSchema } from '../shared/offlineStudent'
import { NeonRequestError, request } from './neon'
import {
  attendanceKey,
  listPendingAttendance,
  listPendingStudent,
  recordStudentOutcome,
  studentOperationId,
  recordAttendanceOutcome,
  syncResponseSchema,
} from './offlineAttendanceStore'

async function sendQueuedOperation(path: string, userId: string, body: unknown): Promise<unknown> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await request(path, userId, body, false)
    } catch (cause) {
      if (attempt === 2 || (cause instanceof NeonRequestError && cause.status < 500)) throw cause
      await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt))
    }
  }
}

export async function syncOfflineAttendance(userId: string, retryForbidden = false) {
  if (!navigator.locks)
    throw new Error('This browser cannot safely coordinate offline sync between tabs.')
  return navigator.locks.request(`halaqa-offline-sync:${userId}`, async () => {
    const pending = await listPendingAttendance(userId)
    const outcomes = []
    const blocked = new Set<string>()
    for (const item of pending) {
      const key = attendanceKey(item)
      if (item.outcome && !(retryForbidden && item.outcome.kind === 'forbidden')) {
        blocked.add(key)
        continue
      }
      if (blocked.has(key)) continue
      const { event, expectedEventId, expectedRevision } = item
      const result = await sendQueuedOperation('/api/attendance/sync', userId, {
        accountId: userId,
        records: [{ event, expectedEventId, expectedRevision }],
      })
      const response = syncResponseSchema.parse(result)
      if (response.outcomes.length !== 1 || response.outcomes[0]?.id !== item.event.id)
        throw new Error('The attendance sync response did not match the queued record.')
      const outcome = response.outcomes[0]
      await recordAttendanceOutcome(userId, outcome)
      outcomes.push(outcome)
      if (outcome.kind !== 'saved' && outcome.kind !== 'unchanged') blocked.add(key)
    }
    return outcomes
  })
}

export async function syncOfflineStudent(userId: string, retryForbidden = false) {
  if (!navigator.locks)
    throw new Error('This browser cannot safely coordinate offline sync between tabs.')
  return navigator.locks.request(`halaqa-offline-student-sync:${userId}`, async () => {
    const pending = await listPendingStudent(userId)
    const outcomes = []
    const blocked = new Set<string>()
    for (const item of pending) {
      const operation = item.operation
      const key = operation.kind === 'contact' ? operation.studentId : operation.event.id
      if (blocked.has(key)) continue
      if (item.outcome && !(retryForbidden && item.outcome.kind === 'forbidden')) {
        blocked.add(key)
        continue
      }
      const result = await sendQueuedOperation('/api/student/sync', userId, {
        accountId: userId,
        operation,
      })
      const outcome = offlineStudentOutcomeSchema.parse(result)
      if (outcome.id !== studentOperationId(operation))
        throw new Error('The student sync response did not match the queued record.')
      await recordStudentOutcome(userId, outcome)
      outcomes.push(outcome)
      if (outcome.kind !== 'saved') blocked.add(key)
    }
    return outcomes
  })
}
