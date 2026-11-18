import { NeonRequestError, request } from './neon'
import {
  attendanceKey,
  listPendingAttendance,
  recordAttendanceOutcome,
  syncResponseSchema,
} from './offlineAttendanceStore'

export async function syncOfflineAttendance(userId: string) {
  if (!navigator.locks)
    throw new Error('This browser cannot safely coordinate offline sync between tabs.')
  return navigator.locks.request(`halaqa-offline-sync:${userId}`, async () => {
    const pending = await listPendingAttendance(userId)
    const outcomes = []
    const blocked = new Set<string>()
    for (const item of pending) {
      const key = attendanceKey(item)
      if (item.outcome) {
        blocked.add(key)
        continue
      }
      if (blocked.has(key)) continue
      let result: unknown
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          result = await request(
            '/api/attendance/sync',
            userId,
            {
              accountId: userId,
              records: [{ event: item.event, expectedEventId: item.expectedEventId }],
            },
            false,
          )
          break
        } catch (cause) {
          if (attempt === 2 || (cause instanceof NeonRequestError && cause.status < 500))
            throw cause
          await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt))
        }
      }
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
